'use client';

import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { CheckCircle2, FileDown, FileSpreadsheet, Plus, XCircle } from 'lucide-react';
import { formatAoa, hasPermission, isCentralDirectorate } from '@/lib/domain';
import { downloadFinancialReceiptPdf, downloadFinancialReportPdf } from '@/lib/pdf';
import type { PanelProps } from './types';

interface AccountItem {
  id: number;
  scope: string;
  province_id: number | null;
  province_name: string | null;
  name: string;
  balance_aoa: number;
}

interface TransactionItem {
  id: number;
  scope: string;
  province_name: string | null;
  type: string;
  category: string;
  description: string;
  amount_aoa: number;
  reference_date: string;
  receipt_number: string;
  status: string;
  member_name: string | null;
  member_code: string | null;
}

interface DelinquencyItem {
  member_id: number;
  member_code: string;
  full_name: string;
  province_name: string;
  category_name: string;
  expected_months: number;
  paid_months: number;
  overdueCount: number;
  overdueAmountAoa: number;
  status: string;
}

export function FinanceModule({ user, catalog }: PanelProps) {
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [delinquency, setDelinquency] = useState<DelinquencyItem[]>([]);
  const [summary, setSummary] = useState({ totalRevenue: 0, totalExpenses: 0, netBalance: 0, pendingApprovalCount: 0 });
  const [period, setPeriod] = useState('');
  const [scopeFilter, setScopeFilter] = useState('');
  const [membersList, setMembersList] = useState<Array<{ id: number; full_name: string; member_code: string }>>([]);

  // New movement form
  const [txScope, setTxScope] = useState<'NACIONAL' | 'PROVINCIAL'>(
    hasPermission(user.role_code, 'MANAGE_NATIONAL_FINANCE') ? 'NACIONAL' : 'PROVINCIAL'
  );
  const [txProvince, setTxProvince] = useState(String(user.province_id || catalog.provinces[0]?.id || ''));
  const [txType, setTxType] = useState('QUOTA');
  const [txCategory, setTxCategory] = useState('Quotas Estatutárias');
  const [txDesc, setTxDesc] = useState('');
  const [txAmount, setTxAmount] = useState('2500');
  const [txMemberId, setTxMemberId] = useState('');
  const [txMonth, setTxMonth] = useState(new Date().toISOString().slice(0, 7));

  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  const canNational = hasPermission(user.role_code, 'MANAGE_NATIONAL_FINANCE');
  const canProvincial = hasPermission(user.role_code, 'MANAGE_PROVINCIAL_FINANCE');
  const canApproveExp = hasPermission(user.role_code, 'APPROVE_EXPENSES');
  const isManager = canNational || canProvincial || isCentralDirectorate(user.role_code);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (period) params.set('period', period);
    if (scopeFilter) params.set('scope', scopeFilter);

    fetch(`/api/finance?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setAccounts(data.accounts || []);
          setTransactions(data.transactions || []);
          setDelinquency(data.delinquency || []);
          if (data.summary) setSummary(data.summary);
        }
      });

    if (isManager) {
      fetch('/api/members')
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled) setMembersList(d.members || []);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [period, scopeFilter, isManager, reloadTick]);

  async function handleRecord(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    setErr('');
    const res = await fetch('/api/finance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: txScope,
        province_id: txScope === 'PROVINCIAL' ? Number(txProvince) : null,
        type: txType,
        category: txCategory,
        description: txDesc || `${txType} — ${txCategory}`,
        amount_aoa: Number(txAmount),
        member_id: txType === 'QUOTA' && txMemberId ? Number(txMemberId) : null,
        reference_month: txMonth,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || 'Erro ao registar movimento.');
    } else {
      setMsg(`Movimento registado · Recibo: ${data.receipt_number} (${data.status})`);
      setTxDesc('');
      setReloadTick((t) => t + 1);
    }
  }

  async function handleAction(id: number, action: 'APROVAR' | 'REJEITAR' | 'ANULAR') {
    const res = await fetch('/api/finance', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    });
    if (res.ok) {
      setMsg(`Operação ${action} registada com rasto de auditoria.`);
      setReloadTick((t) => t + 1);
    }
  }

  function exportExcel() {
    const rows = transactions.map((t) => ({
      Data: t.reference_date,
      Recibo: t.receipt_number,
      Ambito: t.scope,
      Provincia: t.province_name || 'Nacional',
      Tipo: t.type,
      Categoria: t.category,
      Descricao: t.description,
      Valor_AOA: t.amount_aoa,
      Estado: t.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Movimentos_AJJ');
    XLSX.writeFile(wb, `Relatorio-Financeiro-SGAJJ-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#A6863A]">
            Tesouraria Nacional e Fundos Provinciais
          </p>
          <h2 className="font-serif-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
            Gestão Financeira e Quotas
          </h2>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => downloadFinancialReportPdf('Relatório Financeiro Institucional', transactions)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1B30] px-3 py-2 text-xs font-semibold cursor-pointer"
          >
            <FileDown className="h-3.5 w-3.5 text-[#A6863A]" /> Exportar PDF
          </button>
          <button
            type="button"
            onClick={exportExcel}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-3 py-2 text-xs font-semibold text-white cursor-pointer"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Exportar Excel
          </button>
        </div>
      </div>

      {msg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 p-3 text-xs text-emerald-800 dark:text-emerald-300">
          {msg}
        </div>
      )}
      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 p-3 text-xs text-red-700 dark:text-red-300">
          {err}
        </div>
      )}

      {isManager && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-5">
              <p className="text-xs text-slate-500">Receitas Aprovadas</p>
              <p className="mt-1 font-mono-tabular text-xl font-bold text-emerald-600">{formatAoa(summary.totalRevenue)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-5">
              <p className="text-xs text-slate-500">Despesas Aprovadas</p>
              <p className="mt-1 font-mono-tabular text-xl font-bold text-red-600">{formatAoa(summary.totalExpenses)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-5">
              <p className="text-xs text-slate-500">Saldo Líquido do Período</p>
              <p className="mt-1 font-mono-tabular text-xl font-bold text-[#0B1F3A] dark:text-white">
                {formatAoa(summary.netBalance)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-5">
              <p className="text-xs text-slate-500">Despesas Pendentes de Autorização</p>
              <p className="mt-1 font-mono-tabular text-xl font-bold text-amber-600">{summary.pendingApprovalCount}</p>
            </div>
          </div>

          {/* Account Balances */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
              Saldos das Contas (Separação Nacional / Provincial)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {accounts.slice(0, 8).map((acc) => (
                <div key={acc.id} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                  <p className="text-[11px] font-semibold text-[#A6863A]">{acc.scope}</p>
                  <p className="text-xs font-medium text-slate-900 dark:text-white truncate">{acc.name}</p>
                  <p className="font-mono-tabular text-sm font-bold text-[#0B1F3A] dark:text-white mt-1">
                    {formatAoa(acc.balance_aoa)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Record Movement Form */}
          <form
            onSubmit={handleRecord}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-4"
          >
            <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white flex items-center gap-2">
              <Plus className="h-4 w-4 text-[#A6863A]" />
              Registar Quota, Receita ou Despesa
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Conta / Âmbito</label>
                <select
                  value={txScope}
                  disabled={!canNational}
                  onChange={(e) => setTxScope(e.target.value as 'NACIONAL' | 'PROVINCIAL')}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs disabled:opacity-60"
                >
                  {canNational && <option value="NACIONAL">Tesouraria Nacional</option>}
                  <option value="PROVINCIAL">Fundo Provincial</option>
                </select>
              </div>

              {txScope === 'PROVINCIAL' && (
                <div>
                  <label className="block text-xs font-semibold mb-1">Província</label>
                  <select
                    value={txProvince}
                    disabled={!canNational && Boolean(user.province_id)}
                    onChange={(e) => setTxProvince(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs disabled:opacity-60"
                  >
                    {catalog.provinces.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold mb-1">Tipo de Movimento</label>
                <select
                  value={txType}
                  onChange={(e) => setTxType(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
                >
                  <option value="QUOTA">Pagamento de Quota</option>
                  <option value="CONTRIBUICAO_EXTRAORDINARIA">Contribuição Extraordinária</option>
                  <option value="RECEITA">Outra Receita</option>
                  <option value="DESPESA">Despesa</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Valor (AOA) *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs font-mono-tabular"
                />
              </div>

              {txType === 'QUOTA' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Associado</label>
                    <select
                      value={txMemberId}
                      onChange={(e) => setTxMemberId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
                    >
                      <option value="">Selecionar associado...</option>
                      {membersList.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.member_code} — {m.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Mês de Referência</label>
                    <input
                      type="month"
                      value={txMonth}
                      onChange={(e) => setTxMonth(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold mb-1">Rubrica / Categoria</label>
                <input
                  value={txCategory}
                  onChange={(e) => setTxCategory(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold mb-1">Descrição *</label>
                <input
                  required
                  value={txDesc}
                  onChange={(e) => setTxDesc(e.target.value)}
                  placeholder="Ex.: Quota mensal / Aquisição de material jurídico"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
                />
              </div>
            </div>

            <button
              type="submit"
              className="rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-5 py-2 text-xs font-semibold text-white cursor-pointer"
            >
              Registar Lançamento e Emitir Recibo
            </button>
          </form>
        </>
      )}

      {/* Transactions Ledger */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white">Movimentos e Recibos</h3>
          <div className="flex gap-2">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-1.5 text-xs"
            >
              <option value="">Todo o Período</option>
              <option value="MENSAL">Relatório Mensal</option>
              <option value="TRIMESTRAL">Relatório Trimestral</option>
              <option value="ANUAL">Relatório Anual</option>
            </select>
            {canNational && (
              <select
                value={scopeFilter}
                onChange={(e) => setScopeFilter(e.target.value)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-1.5 text-xs"
              >
                <option value="">Todas as Contas</option>
                <option value="NACIONAL">Nacional</option>
                <option value="PROVINCIAL">Provincial</option>
              </select>
            )}
          </div>
        </div>

        {transactions.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">Nenhum movimento financeiro registado no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Recibo / Data</th>
                  <th className="py-2 pr-3 font-semibold">Âmbito / Descrição</th>
                  <th className="py-2 pr-3 font-semibold">Tipo</th>
                  <th className="py-2 pr-3 text-right font-semibold">Montante</th>
                  <th className="py-2 pr-3 font-semibold">Estado</th>
                  <th className="py-2 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="py-2.5 pr-3 font-mono-tabular">
                      <p className="font-semibold">{tx.receipt_number}</p>
                      <p className="text-slate-500">{tx.reference_date}</p>
                    </td>
                    <td className="py-2.5 pr-3">
                      <p className="font-medium text-slate-900 dark:text-white">{tx.description}</p>
                      <p className="text-slate-500">
                        {tx.scope} {tx.province_name ? `· ${tx.province_name}` : ''} {tx.member_code ? `· ${tx.member_code}` : ''}
                      </p>
                    </td>
                    <td className="py-2.5 pr-3">{tx.type}</td>
                    <td className="py-2.5 pr-3 text-right font-mono-tabular font-semibold">
                      {tx.type === 'DESPESA' ? '-' : '+'} {formatAoa(tx.amount_aoa)}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`font-semibold ${
                          tx.status === 'APROVADO'
                            ? 'text-emerald-600'
                            : tx.status === 'PENDENTE_APROVACAO'
                              ? 'text-amber-600'
                              : 'text-red-600'
                        }`}
                      >
                        {tx.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="inline-flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => downloadFinancialReceiptPdf(tx)}
                          className="rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-[11px] cursor-pointer"
                        >
                          Recibo PDF
                        </button>
                        {canApproveExp && tx.status === 'PENDENTE_APROVACAO' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleAction(tx.id, 'APROVAR')}
                              className="inline-flex items-center gap-0.5 rounded bg-emerald-600 text-white px-2 py-1 text-[11px] cursor-pointer"
                            >
                              <CheckCircle2 className="h-3 w-3" /> Aprovar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAction(tx.id, 'REJEITAR')}
                              className="inline-flex items-center gap-0.5 rounded bg-red-600 text-white px-2 py-1 text-[11px] cursor-pointer"
                            >
                              <XCircle className="h-3 w-3" /> Rejeitar
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delinquency Control */}
      {isManager && delinquency.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6">
          <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white mb-4">Controlo de Inadimplência de Quotas</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th className="py-2 pr-3">Código</th>
                  <th className="py-2 pr-3">Associado</th>
                  <th className="py-2 pr-3">Quotas Pagas / Esperadas</th>
                  <th className="py-2 pr-3 text-right">Em Atraso (AOA)</th>
                  <th className="py-2 text-right">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {delinquency.map((d) => (
                  <tr key={d.member_id}>
                    <td className="py-2 pr-3 font-mono-tabular">{d.member_code}</td>
                    <td className="py-2 pr-3">
                      {d.full_name} <span className="text-slate-500">({d.province_name})</span>
                    </td>
                    <td className="py-2 pr-3 font-mono-tabular">
                      {d.paid_months} / {d.expected_months}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono-tabular font-semibold">
                      {formatAoa(d.overdueAmountAoa)}
                    </td>
                    <td className="py-2 text-right font-semibold">
                      <span className={d.status === 'REGULAR' ? 'text-emerald-600' : 'text-amber-600'}>
                        {d.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
