'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Plus, Search, UserCheck, UserX } from 'lucide-react';
import { APPLICATION_STATUS_LABELS, formatAoa, hasPermission, isCentralDirectorate } from '@/lib/domain';
import type { PanelProps } from './types';

interface MemberRow {
  id: number;
  member_code: string;
  full_name: string;
  phone: string;
  email: string;
  province_id: number;
  province_name: string;
  category_id: number;
  category_name: string;
  institution: string;
  academic_degree: string;
  status: string;
  joined_at: string;
  paid_quotas_count: number;
  total_contributed_aoa: number;
}

interface ApplicationRow {
  id: number;
  tracking_number: string;
  full_name: string;
  email: string;
  phone: string;
  province_name: string;
  category_name: string;
  institution: string;
  academic_degree: string;
  status: string;
  member_code: string | null;
  created_at: string;
}

export function MembersModule({ user, catalog }: PanelProps) {
  const [subTab, setSubTab] = useState<'members' | 'applications' | 'new'>('members');
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [q, setQ] = useState('');
  const [submittedQ, setSubmittedQ] = useState('');
  const [provFilter, setProvFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [msg, setMsg] = useState('');
  const [activationUrl, setActivationUrl] = useState('');
  const [err, setErr] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  // New Member form
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('+244 ');
  const [newProv, setNewProv] = useState(String(user.province_id || catalog.provinces[0]?.id || ''));
  const [newCat, setNewCat] = useState(String(catalog.categories[0]?.id || ''));
  const [newInst, setNewInst] = useState('');
  const [newDegree, setNewDegree] = useState('');

  const canApproveApps = hasPermission(user.role_code, 'APPROVE_APPLICATIONS');
  const isNat = isCentralDirectorate(user.role_code);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (submittedQ.trim()) params.set('q', submittedQ.trim());
    if (provFilter) params.set('provinceId', provFilter);
    if (statusFilter) params.set('status', statusFilter);

    Promise.all([
      fetch(`/api/members?${params.toString()}`).then((r) => r.json()),
      fetch('/api/applications').then((r) => r.json()),
    ]).then(([mData, aData]) => {
      if (!cancelled) {
        setMembers(mData.members || []);
        setApplications(aData.applications || []);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [submittedQ, provFilter, statusFilter, reloadTick]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSubmittedQ(q);
    setReloadTick((t) => t + 1);
  }

  async function handleMemberStatus(id: number, status: string) {
    setErr('');
    setMsg('');
    setActivationUrl('');
    const res = await fetch('/api/members', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) {
      setMsg(`Estado do associado atualizado para ${status}.`);
      setReloadTick((t) => t + 1);
    }
  }

  async function handleTransferProvince(memberId: number, provinceId: number) {
    if (!provinceId) return;
    setErr('');
    setMsg('');
    const res = await fetch('/api/members', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: memberId, province_id: provinceId }),
    });
    if (res.ok) {
      setMsg('Transferência provincial registada e auditada com sucesso.');
      setReloadTick((t) => t + 1);
    }
  }

  async function handleApplicationAction(id: number, status: string) {
    setErr('');
    setMsg('');
    setActivationUrl('');
    const res = await fetch('/api/applications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        status,
        reviewer_notes: `Decisão registada por ${user.full_name}`,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || 'Erro ao atualizar candidatura.');
    } else {
      setMsg(
        data.member_code
          ? `Candidatura aprovada! Associado registado com código permanente ${data.member_code}.`
          : `Estado da candidatura atualizado para ${APPLICATION_STATUS_LABELS[status] || status}.`
      );
      if (data.activationUrl) setActivationUrl(data.activationUrl);
      setReloadTick((t) => t + 1);
    }
  }

  async function handleCreateMember(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setMsg('');
    setActivationUrl('');
    const res = await fetch('/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: newName,
        email: newEmail,
        phone: newPhone,
        province_id: Number(newProv),
        category_id: Number(newCat),
        institution: newInst,
        academic_degree: newDegree,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || 'Erro ao registar associado.');
    } else {
      setMsg(`Associado registado com sucesso! Código único: ${data.memberCode}`);
      if (data.activationUrl) setActivationUrl(data.activationUrl);
      setNewName('');
      setNewEmail('');
      setNewInst('');
      setSubTab('members');
      setReloadTick((t) => t + 1);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#A6863A]">Sistema Nacional de Associados</p>
          <h2 className="font-serif-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
            Associados e Candidaturas
          </h2>
        </div>

        <div className="inline-flex gap-1 rounded-lg bg-slate-200/70 dark:bg-slate-800 p-1">
          <button
            type="button"
            onClick={() => setSubTab('members')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
              subTab === 'members' ? 'bg-white dark:bg-[#0D1B30] text-[#0B1F3A] dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Associados ({members.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('applications')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
              subTab === 'applications' ? 'bg-white dark:bg-[#0D1B30] text-[#0B1F3A] dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Candidaturas ({applications.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('new')}
            className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
              subTab === 'new' ? 'bg-[#0B1F3A] text-white' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <Plus className="h-3.5 w-3.5" /> Registo Direto
          </button>
        </div>
      </div>

      {msg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 p-3 text-xs font-medium text-emerald-800 dark:text-emerald-300 space-y-2">
          <p>{msg}</p>
          {activationUrl && (
            <div className="rounded border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-[#071121] p-2 font-mono-tabular text-[11px] break-all">
              Link seguro de ativação (SMS/E-mail sem senha em texto simples):{' '}
              <a href={activationUrl} className="font-bold text-[#A6863A] underline">
                {activationUrl}
              </a>
            </div>
          )}
        </div>
      )}
      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 p-3 text-xs text-red-700 dark:text-red-300">
          {err}
        </div>
      )}

      {subTab === 'members' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-5">
          <form onSubmit={handleSearch} className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Pesquisar por nome, código ou e-mail..."
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] pl-9 pr-3 py-2 text-xs"
              />
            </div>
            {isNat && (
              <select
                value={provFilter}
                onChange={(e) => setProvFilter(e.target.value)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
              >
                <option value="">Todas as Províncias</option>
                {catalog.provinces.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
            >
              <option value="">Todos os Estados</option>
              <option value="ATIVO">Ativos</option>
              <option value="SUSPENSO">Suspensos</option>
              <option value="INATIVO">Inativos</option>
            </select>
            <button
              type="submit"
              className="rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-4 py-2 text-xs font-semibold text-white cursor-pointer"
            >
              Filtrar
            </button>
          </form>

          {members.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">Nenhum associado encontrado com os filtros atuais.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <th className="py-2 pr-3 font-semibold">Código</th>
                    <th className="py-2 pr-3 font-semibold">Associado</th>
                    <th className="py-2 pr-3 font-semibold">Província / Categoria</th>
                    <th className="py-2 pr-3 font-semibold">Quotas Pagas</th>
                    <th className="py-2 pr-3 font-semibold">Estado</th>
                    <th className="py-2 text-right font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td className="py-3 pr-3 font-mono-tabular font-semibold text-[#0B1F3A] dark:text-[#C5A24D]">
                        {m.member_code}
                      </td>
                      <td className="py-3 pr-3">
                        <p className="font-semibold text-slate-900 dark:text-white">{m.full_name}</p>
                        <p className="text-slate-500">{m.email} · {m.phone}</p>
                      </td>
                      <td className="py-3 pr-3">
                        {isNat ? (
                          <select
                            aria-label={`Transferir província de ${m.full_name}`}
                            value={m.province_id}
                            onChange={(e) => handleTransferProvince(m.id, Number(e.target.value))}
                            className="rounded border border-slate-200 dark:border-slate-700 bg-transparent px-1.5 py-0.5 text-xs mb-0.5"
                          >
                            {catalog.provinces.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <p>{m.province_name}</p>
                        )}
                        <p className="text-slate-500">{m.category_name}</p>
                      </td>
                      <td className="py-3 pr-3 font-mono-tabular">
                        {m.paid_quotas_count} ({formatAoa(m.total_contributed_aoa)})
                      </td>
                      <td className="py-3 pr-3">
                        <span className={`font-semibold ${m.status === 'ATIVO' ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {m.status}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        {m.status === 'ATIVO' ? (
                          <button
                            type="button"
                            onClick={() => handleMemberStatus(m.id, 'SUSPENSO')}
                            className="inline-flex items-center gap-1 rounded border border-amber-300 text-amber-700 px-2 py-1 text-[11px] cursor-pointer"
                          >
                            <UserX className="h-3 w-3" /> Suspender
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleMemberStatus(m.id, 'ATIVO')}
                            className="inline-flex items-center gap-1 rounded border border-emerald-300 text-emerald-700 px-2 py-1 text-[11px] cursor-pointer"
                          >
                            <UserCheck className="h-3 w-3" /> Reativar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {subTab === 'applications' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6">
          {applications.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">Nenhuma candidatura de adesão registada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <th className="py-2 pr-3 font-semibold">N.º Processo</th>
                    <th className="py-2 pr-3 font-semibold">Candidato</th>
                    <th className="py-2 pr-3 font-semibold">Província / Categoria</th>
                    <th className="py-2 pr-3 font-semibold">Estado</th>
                    <th className="py-2 text-right font-semibold">Decisão</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {applications.map((ap) => (
                    <tr key={ap.id}>
                      <td className="py-3 pr-3 font-mono-tabular font-semibold">{ap.tracking_number}</td>
                      <td className="py-3 pr-3">
                        <p className="font-semibold text-slate-900 dark:text-white">{ap.full_name}</p>
                        <p className="text-slate-500">{ap.email} · {ap.phone}</p>
                      </td>
                      <td className="py-3 pr-3">
                        <p>{ap.province_name}</p>
                        <p className="text-slate-500">{ap.category_name}</p>
                      </td>
                      <td className="py-3 pr-3">
                        <span className="font-semibold text-[#A6863A]">
                          {APPLICATION_STATUS_LABELS[ap.status] || ap.status}
                        </span>
                        {ap.member_code && <p className="font-mono-tabular text-emerald-600">{ap.member_code}</p>}
                      </td>
                      <td className="py-3 text-right">
                        {ap.status !== 'APROVADA' && (
                          <div className="inline-flex flex-wrap justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleApplicationAction(ap.id, 'EM_ANALISE')}
                              className="rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-[11px] cursor-pointer"
                            >
                              Em Análise
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApplicationAction(ap.id, 'AGUARDA_DOCUMENTACAO')}
                              className="rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-[11px] cursor-pointer"
                            >
                              Doc. Incompleta
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApplicationAction(ap.id, 'AGUARDA_VALIDACAO')}
                              className="rounded border border-[#A6863A]/60 text-[#A6863A] px-2 py-1 text-[11px] cursor-pointer"
                            >
                              P/ Validação Central
                            </button>
                            {canApproveApps && (
                              <button
                                type="button"
                                onClick={() => handleApplicationAction(ap.id, 'APROVADA')}
                                className="inline-flex items-center gap-1 rounded bg-emerald-600 text-white px-2.5 py-1 text-[11px] font-semibold cursor-pointer"
                              >
                                <CheckCircle2 className="h-3 w-3" /> Aprovar
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleApplicationAction(ap.id, 'REJEITADA')}
                              className="rounded border border-red-300 text-red-600 px-2 py-1 text-[11px] cursor-pointer"
                            >
                              Rejeitar
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {subTab === 'new' && (
        <form
          onSubmit={handleCreateMember}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-4 max-w-3xl"
        >
          <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white">Registo Direto de Associado</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1">Nome Completo *</label>
              <input
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">E-mail *</label>
              <input
                required
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Telefone *</label>
              <input
                required
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Província *</label>
              <select
                value={newProv}
                disabled={!isNat && Boolean(user.province_id)}
                onChange={(e) => setNewProv(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-sm disabled:opacity-60"
              >
                {catalog.provinces.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Categoria *</label>
              <select
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-sm"
              >
                {catalog.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Instituição / Formação</label>
              <input
                value={newInst}
                onChange={(e) => setNewInst(e.target.value)}
                placeholder="Faculdade ou Entidade"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-5 py-2.5 text-xs font-semibold text-white cursor-pointer"
          >
            Registar e Gerar Código Permanente + Cartão QR
          </button>
        </form>
      )}
    </div>
  );
}
