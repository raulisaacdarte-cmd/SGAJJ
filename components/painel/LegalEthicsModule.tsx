'use client';

import React, { useEffect, useState } from 'react';
import { Gavel, Lock, Scale, ShieldAlert } from 'lucide-react';
import { hasPermission } from '@/lib/domain';
import type { PanelProps } from './types';

interface LegalItem {
  id: number;
  item_type: string;
  reference_code: string;
  title: string;
  summary: string;
  content: string;
  confidentiality: string;
  submitted_to_central: number;
  province_name: string | null;
  author_name: string | null;
  status: string;
  created_at: string;
}

interface EthicsCase {
  id: number;
  case_number: string;
  case_type: string;
  subject: string;
  description: string;
  province_name: string | null;
  status: string;
  proceedings_log_json: string;
  recommendations: string;
  forwarded_to: string;
  decision_summary: string;
  created_at: string;
}

export function LegalEthicsModule({ user, catalog }: PanelProps) {
  const canLegal = hasPermission(user.role_code, 'ACCESS_LEGAL_OFFICE');
  const canEthics = hasPermission(user.role_code, 'ACCESS_ETHICS');

  const [tab, setTab] = useState<'legal' | 'ethics'>(canLegal ? 'legal' : 'ethics');
  const [legalItems, setLegalItems] = useState<LegalItem[]>([]);
  const [ethicsCases, setEthicsCases] = useState<EthicsCase[]>([]);

  // Legal Office Form
  const [lType, setLType] = useState('PARECER');
  const [lTitle, setLTitle] = useState('');
  const [lSummary, setLSummary] = useState('');
  const [lContent, setLContent] = useState('');
  const [lConf, setLConf] = useState('DIRECAO_CENTRAL');
  const [lSubmitCentral, setLSubmitCentral] = useState(true);

  // Ethics Form
  const [eType, setEType] = useState('OCORRENCIA');
  const [eSubject, setESubject] = useState('');
  const [eDesc, setEDesc] = useState('');
  const [eProvId, setEProvId] = useState(String(user.province_id || ''));
  const [eComplainant, setEComplainant] = useState('');
  const [eAccused, setEAccused] = useState('');

  // Ethics Diligence Update
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const [diligenceNote, setDiligenceNote] = useState('');
  const [nextEthicsStatus, setNextEthicsStatus] = useState('EM_DILIGENCIA');
  const [recommendations, setRecommendations] = useState('');

  const [msg, setMsg] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (canLegal) {
      fetch('/api/legal-office')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled && d) setLegalItems(d.items || []);
        });
    }
    if (canEthics) {
      fetch('/api/ethics')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled && d) setEthicsCases(d.cases || []);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [canLegal, canEthics, reloadTick]);

  if (!canLegal && !canEthics) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-8 space-y-2">
        <Lock className="h-6 w-6 text-[#A6863A]" />
        <h2 className="font-serif-display text-xl font-bold text-[#0B1F3A] dark:text-white">Acesso Restrito</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Os módulos do Gabinete Jurídico e da Comissão de Fiscalização e Ética possuem controlo de confidencialidade reservado aos respetivos órgãos estatutários e à Presidência.
        </p>
      </div>
    );
  }

  async function handleCreateLegal(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/legal-office', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_type: lType,
        title: lTitle,
        summary: lSummary,
        content: lContent,
        confidentiality: lConf,
        submitted_to_central: lSubmitCentral,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg(`Registo jurídico criado: ${data.reference_code}`);
      setLTitle('');
      setLSummary('');
      setLContent('');
      setReloadTick((t) => t + 1);
    }
  }

  async function handleCreateEthics(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/ethics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        case_type: eType,
        subject: eSubject,
        description: eDesc,
        province_id: eProvId ? Number(eProvId) : null,
        complainant_info: eComplainant,
        accused_info: eAccused,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg(`Processo de Fiscalização e Ética aberto: ${data.case_number}`);
      setESubject('');
      setEDesc('');
      setReloadTick((t) => t + 1);
    }
  }

  async function handleUpdateCase(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCaseId) return;
    const res = await fetch('/api/ethics', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: selectedCaseId,
        status: nextEthicsStatus,
        proceeding_note: diligenceNote,
        recommendations: recommendations || undefined,
      }),
    });
    if (res.ok) {
      setMsg('Diligência e estado processual registados.');
      setSelectedCaseId(null);
      setDiligenceNote('');
      setReloadTick((t) => t + 1);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#A6863A]">Órgãos Técnicos e Disciplinares</p>
          <h2 className="font-serif-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
            Gabinete Jurídico e Fiscalização & Ética
          </h2>
        </div>

        <div className="inline-flex gap-1 rounded-lg bg-slate-200/70 dark:bg-slate-800 p-1">
          {canLegal && (
            <button
              type="button"
              onClick={() => setTab('legal')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                tab === 'legal' ? 'bg-white dark:bg-[#0D1B30] text-[#0B1F3A] dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Gabinete Jurídico ({legalItems.length})
            </button>
          )}
          {canEthics && (
            <button
              type="button"
              onClick={() => setTab('ethics')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                tab === 'ethics' ? 'bg-white dark:bg-[#0D1B30] text-[#0B1F3A] dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Fiscalização e Ética ({ethicsCases.length})
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-xs text-emerald-700 dark:text-emerald-300">
          {msg}
        </div>
      )}

      {tab === 'legal' && canLegal && (
        <div className="space-y-6">
          <form
            onSubmit={handleCreateLegal}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-4"
          >
            <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white flex items-center gap-2">
              <Scale className="h-4 w-4 text-[#A6863A]" /> Registar Parecer, Consulta, Estudo ou Legislação
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Tipologia</label>
                <select
                  value={lType}
                  onChange={(e) => setLType(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
                >
                  <option value="PARECER">Parecer Jurídico</option>
                  <option value="CONSULTA">Consulta Jurídica</option>
                  <option value="LEGISLACAO">Arquivo de Legislação</option>
                  <option value="ESTUDO">Estudo Técnico</option>
                  <option value="PROCESSO_INTERNO">Processo Interno</option>
                  <option value="EDUCACAO_JURIDICA">Educação Jurídica</option>
                  <option value="RELATORIO_INTERVENCAO">Relatório de Intervenção</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Confidencialidade</label>
                <select
                  value={lConf}
                  onChange={(e) => setLConf(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
                >
                  <option value="DIRECAO_CENTRAL">Direção Central</option>
                  <option value="RESTRITO">Restrito / Confidencial</option>
                  <option value="PROVINCIAL">Coordenação Provincial</option>
                  <option value="PUBLICO">Público Interno</option>
                </select>
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={lSubmitCentral} onChange={(e) => setLSubmitCentral(e.target.checked)} />
                  <span>Submeter à Direção Central</span>
                </label>
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold mb-1">Título *</label>
                <input
                  required
                  value={lTitle}
                  onChange={(e) => setLTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold mb-1">Conteúdo / Fundamentação Jurídica *</label>
                <textarea
                  required
                  rows={4}
                  value={lContent}
                  onChange={(e) => setLContent(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
                />
              </div>
            </div>
            <button
              type="submit"
              className="rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-5 py-2 text-xs font-semibold text-white cursor-pointer"
            >
              Registar no Gabinete Jurídico
            </button>
          </form>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 divide-y divide-slate-100 dark:divide-slate-800">
            {legalItems.length === 0 ? (
              <p className="text-xs text-slate-500">Nenhum registo no Gabinete Jurídico.</p>
            ) : (
              legalItems.map((it) => (
                <div key={it.id} className="py-3 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-mono-tabular font-bold text-[#A6863A]">{it.reference_code}</span>
                    <span className="text-slate-500">
                      {it.item_type} · {it.confidentiality} · {it.status}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-[#0B1F3A] dark:text-white">{it.title}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{it.content.slice(0, 260)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'ethics' && canEthics && (
        <div className="space-y-6">
          <form
            onSubmit={handleCreateEthics}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-4"
          >
            <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-[#A6863A]" /> Registar Ocorrência, Participação ou Denúncia
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Tipologia</label>
                <select
                  value={eType}
                  onChange={(e) => setEType(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
                >
                  <option value="OCORRENCIA">Ocorrência</option>
                  <option value="PARTICIPACAO">Participação</option>
                  <option value="DENUNCIA">Denúncia</option>
                  <option value="PROCESSO_DISCIPLINAR">Processo Disciplinar</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Província</label>
                <select
                  value={eProvId}
                  onChange={(e) => setEProvId(e.target.value)}
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
              <div>
                <label className="block text-xs font-semibold mb-1">Participante / Denunciante (Confidencial)</label>
                <input
                  value={eComplainant}
                  onChange={(e) => setEComplainant(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Visado / Estrutura</label>
                <input
                  value={eAccused}
                  onChange={(e) => setEAccused(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold mb-1">Assunto *</label>
                <input
                  required
                  value={eSubject}
                  onChange={(e) => setESubject(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold mb-1">Descrição dos Factos *</label>
                <textarea
                  required
                  rows={3}
                  value={eDesc}
                  onChange={(e) => setEDesc(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
                />
              </div>
            </div>
            <button
              type="submit"
              className="rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-5 py-2 text-xs font-semibold text-white cursor-pointer"
            >
              Abrir Processo de Fiscalização
            </button>
          </form>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-4">
            {ethicsCases.length === 0 ? (
              <p className="text-xs text-slate-500">Nenhum processo ético ou disciplinar aberto.</p>
            ) : (
              ethicsCases.map((c) => {
                const logs = JSON.parse(c.proceedings_log_json || '[]') as Array<{
                  date: string;
                  author: string;
                  note: string;
                }>;
                return (
                  <div key={c.id} className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-mono-tabular font-bold text-[#A6863A]">{c.case_number}</span>
                      <span className="font-semibold">{c.status}</span>
                    </div>
                    <p className="text-sm font-bold text-[#0B1F3A] dark:text-white">{c.subject}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">{c.description}</p>
                    <div className="pt-2 space-y-1">
                      {logs.map((lg, i) => (
                        <p key={i} className="text-[11px] text-slate-500">
                          <span className="font-mono-tabular">{lg.date.slice(0, 10)}</span> · {lg.author}: {lg.note}
                        </p>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedCaseId(c.id)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#0B1F3A] dark:text-[#C5A24D] hover:underline cursor-pointer"
                    >
                      <Gavel className="h-3.5 w-3.5" /> Registar Diligência / Contraditório / Decisão
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {selectedCaseId && (
            <form
              onSubmit={handleUpdateCase}
              className="rounded-xl border border-[#A6863A] bg-white dark:bg-[#0D1B30] p-6 space-y-4"
            >
              <h4 className="text-sm font-bold">Atualizar Processo #{selectedCaseId}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">Fase Processual</label>
                  <select
                    value={nextEthicsStatus}
                    onChange={(e) => setNextEthicsStatus(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
                  >
                    <option value="EM_DILIGENCIA">Em Diligência</option>
                    <option value="CONTRADITORIO">Fase de Contraditório</option>
                    <option value="RELATORIO_EMITIDO">Relatório Emitido</option>
                    <option value="ENCAMINHADO">Encaminhado a Órgão Competente</option>
                    <option value="ENCERRADO">Encerrado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Recomendações</label>
                  <input
                    value={recommendations}
                    onChange={(e) => setRecommendations(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold mb-1">Nota da Diligência *</label>
                  <textarea
                    required
                    rows={2}
                    value={diligenceNote}
                    onChange={(e) => setDiligenceNote(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="rounded-lg bg-[#0B1F3A] px-4 py-2 text-xs font-semibold text-white cursor-pointer">
                  Guardar Diligência
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCaseId(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
