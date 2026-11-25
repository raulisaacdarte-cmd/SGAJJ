'use client';

import React, { useEffect, useState } from 'react';
import { Download, FileText, Search, Upload } from 'lucide-react';
import { DOCUMENT_TYPES, hasPermission, isCentralDirectorate } from '@/lib/domain';
import type { PanelProps } from './types';

interface DocItem {
  id: number;
  title: string;
  doc_type: string;
  province_name: string | null;
  department_name: string | null;
  version: number;
  file_path: string;
  file_name: string;
  access_level: string;
  doc_date: string;
  uploaded_by_name: string | null;
}

export function DocumentsModule({ user, catalog }: PanelProps) {
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [q, setQ] = useState('');
  const [submittedQ, setSubmittedQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const [title, setTitle] = useState('');
  const [docType, setDocType] = useState('ESTATUTO');
  const [provId, setProvId] = useState('');
  const [deptId, setDeptId] = useState('');
  const [accessLevel, setAccessLevel] = useState('ASSOCIADOS');
  const [filePath, setFilePath] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [mimeType, setMimeType] = useState('');
  const [msg, setMsg] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  const canUpload = hasPermission(user.role_code, 'MANAGE_DOCUMENTS');

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (submittedQ.trim()) params.set('q', submittedQ.trim());
    if (typeFilter) params.set('docType', typeFilter);

    fetch(`/api/documents?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setDocs(data.documents || []);
      });

    return () => {
      cancelled = true;
    };
  }, [submittedQ, typeFilter, reloadTick]);

  async function handleFileSelect(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', 'archive');
    const res = await fetch('/api/uploads', { method: 'POST', body: fd });
    const data = await res.json();
    if (res.ok) {
      setFilePath(data.filePath);
      setFileName(data.fileName);
      setFileSize(data.fileSize);
      setMimeType(data.mimeType);
    }
  }

  async function handleCreateDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!filePath) return;
    const res = await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        doc_type: docType,
        province_id: provId ? Number(provId) : null,
        department_id: deptId ? Number(deptId) : null,
        access_level: accessLevel,
        file_path: filePath,
        file_name: fileName,
        file_size: fileSize,
        mime_type: mimeType,
      }),
    });
    if (res.ok) {
      setMsg('Documento arquivado com controlo de versão.');
      setTitle('');
      setFilePath('');
      setFileName('');
      setReloadTick((t) => t + 1);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-[#A6863A]">Arquivo Institucional Digital</p>
        <h2 className="font-serif-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
          Gestão Documental da AJJ
        </h2>
      </div>

      {msg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-xs text-emerald-700 dark:text-emerald-300">
          {msg}
        </div>
      )}

      {canUpload && (
        <form
          onSubmit={handleCreateDoc}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-4"
        >
          <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white">Carregar Novo Documento Institucional</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold mb-1">Título do Documento *</label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Estatutos da AJJ / Ata da Assembleia Geral"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Classificação</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
              >
                {DOCUMENT_TYPES.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Nível de Acesso</label>
              <select
                value={accessLevel}
                onChange={(e) => setAccessLevel(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
              >
                <option value="PUBLICO">Público</option>
                <option value="ASSOCIADOS">Associados</option>
                <option value="COORDENACAO">Coordenação</option>
                {isCentralDirectorate(user.role_code) && <option value="DIRECAO_CENTRAL">Direção Central</option>}
                {isCentralDirectorate(user.role_code) && <option value="CONFIDENCIAL">Confidencial</option>}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Departamento</label>
              <select
                value={deptId}
                onChange={(e) => setDeptId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
              >
                <option value="">Geral</option>
                {catalog.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            {isCentralDirectorate(user.role_code) && (
              <div>
                <label className="block text-xs font-semibold mb-1">Província</label>
                <select
                  value={provId}
                  onChange={(e) => setProvId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
                >
                  <option value="">Âmbito Nacional</option>
                  {catalog.provinces.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold mb-1">Ficheiro *</label>
              <label className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-3 py-2 text-xs cursor-pointer">
                <Upload className="h-4 w-4 text-[#A6863A]" />
                <span>{fileName || 'Selecionar PDF, DOCX ou imagem'}</span>
                <input
                  type="file"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
                  }}
                />
              </label>
            </div>
          </div>
          <button
            type="submit"
            disabled={!filePath}
            className="rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-5 py-2 text-xs font-semibold text-white disabled:opacity-40 cursor-pointer"
          >
            Arquivar Documento
          </button>
        </form>
      )}

      {/* Search & Archive List */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setSubmittedQ(q);
                  setReloadTick((t) => t + 1);
                }
              }}
              placeholder="Pesquisar no arquivo..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] pl-9 pr-3 py-2 text-xs"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
          >
            <option value="">Todos os Tipos</option>
            {DOCUMENT_TYPES.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              setSubmittedQ(q);
              setReloadTick((t) => t + 1);
            }}
            className="rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-4 py-2 text-xs font-semibold text-white cursor-pointer"
          >
            Pesquisar
          </button>
        </div>

        {docs.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">Nenhum documento encontrado.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {docs.map((d) => (
              <div key={d.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-[#A6863A] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-[#0B1F3A] dark:text-white">{d.title}</p>
                    <p className="text-xs text-slate-500">
                      {d.doc_type} · v{d.version} · {d.province_name || 'Nacional'} · {d.department_name || 'Geral'} ·{' '}
                      <span className="font-mono-tabular">{d.doc_date}</span> · Acesso: {d.access_level}
                    </p>
                  </div>
                </div>
                <a
                  href={d.file_path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium hover:border-[#A6863A] whitespace-nowrap shrink-0"
                >
                  <Download className="h-3.5 w-3.5" /> Descarregar
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
