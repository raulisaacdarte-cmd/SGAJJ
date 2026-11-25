'use client';

import React, { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';

export function ExportArticlePdfButton({ slug }: { slug: string }) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  async function handleExport() {
    setExporting(true);
    setError('');
    try {
      const res = await fetch(`/api/publications/${encodeURIComponent(slug)}/pdf`);
      if (!res.ok) {
        let message = 'Não foi possível gerar o PDF do artigo.';
        try {
          const data = await res.json();
          if (data?.error) message = data.error;
        } catch {
          // ignore non-JSON error body
        }
        setError(message);
        return;
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `AJJ-${slug}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      setError('Falha de ligação ao exportar o PDF.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleExport}
        disabled={exporting}
        data-testid="export-article-pdf"
        aria-label="Exportar artigo como PDF"
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1B30] px-4 py-2 text-xs font-semibold text-[#0B1F3A] dark:text-white hover:border-[#A6863A] dark:hover:border-[#C5A24D] transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
      >
        {exporting ? (
          <Loader2 className="h-4 w-4 animate-spin text-[#A6863A]" />
        ) : (
          <FileDown className="h-4 w-4 text-[#A6863A]" />
        )}
        <span>{exporting ? 'A gerar PDF...' : 'Exportar como PDF'}</span>
      </button>
      {error && (
        <p role="alert" className="text-[11px] text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
