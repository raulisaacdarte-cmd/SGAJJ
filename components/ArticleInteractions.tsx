'use client';

import React, { useState, useSyncExternalStore } from 'react';
import { MessageSquare, Share2 } from 'lucide-react';

const emptySubscribe = () => () => {};

interface CommentItem {
  id: number;
  author_name: string;
  content: string;
  created_at: string;
}

export function ArticleInteractions({
  slug,
  title,
  initialComments,
}: {
  slug: string;
  title: string;
  initialComments: CommentItem[];
}) {
  const [copied, setCopied] = useState(false);
  const [authorName, setAuthorName] = useState('');
  const [authorEmail, setAuthorEmail] = useState('');
  const [content, setContent] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const shareUrl = useSyncExternalStore(
    emptySubscribe,
    () => window.location.href,
    () => ''
  );

  async function handleCopyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleCommentSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setStatusMsg('');
    try {
      const res = await fetch(`/api/publications/${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author_name: authorName,
          author_email: authorEmail,
          content,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMsg(data.message);
        setAuthorName('');
        setAuthorEmail('');
        setContent('');
      } else {
        setStatusMsg(data.error || 'Erro ao enviar comentário.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border-t border-slate-200 dark:border-slate-800 pt-8 space-y-8">
      {/* Social Sharing */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <Share2 className="h-4 w-4 text-[#A6863A]" />
          Partilhar Publicação
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`${title} — ${shareUrl}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-[#A6863A]"
          >
            WhatsApp
          </a>
          <a
            href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-[#A6863A]"
          >
            LinkedIn
          </a>
          <button
            type="button"
            onClick={handleCopyLink}
            className="rounded-md bg-[#0B1F3A] dark:bg-[#A6863A] px-3 py-1.5 text-xs font-medium text-white cursor-pointer"
          >
            {copied ? 'Ligação copiada' : 'Copiar Ligação'}
          </button>
        </div>
      </div>

      {/* Moderated Comments */}
      <div className="space-y-4">
        <h3 className="inline-flex items-center gap-2 font-serif-display text-xl font-bold text-[#0B1F3A] dark:text-white">
          <MessageSquare className="h-5 w-5 text-[#A6863A]" />
          Comentários Moderados ({initialComments.length})
        </h3>

        {initialComments.length > 0 && (
          <div className="space-y-3">
            {initialComments.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-[#F8F9FB] dark:bg-[#071121] p-4 space-y-1"
              >
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-semibold text-[#0B1F3A] dark:text-white">{c.author_name}</span>
                  <span className="font-mono-tabular">{c.created_at.slice(0, 10)}</span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300">{c.content}</p>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleCommentSubmit} className="space-y-3 pt-2">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Deixar Comentário</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              required
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="O seu nome"
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-sm text-slate-900 dark:text-white"
            />
            <input
              required
              type="email"
              value={authorEmail}
              onChange={(e) => setAuthorEmail(e.target.value)}
              placeholder="O seu e-mail"
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-sm text-slate-900 dark:text-white"
            />
          </div>
          <textarea
            required
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Escreva a sua contribuição jurídica ou comentário..."
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-sm text-slate-900 dark:text-white"
          />
          {statusMsg && <p className="text-xs text-[#A6863A] dark:text-[#C5A24D] font-medium">{statusMsg}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-4 py-2 text-xs font-semibold text-white cursor-pointer disabled:opacity-50"
          >
            {submitting ? 'A enviar...' : 'Submeter Comentário'}
          </button>
        </form>
      </div>
    </div>
  );
}
