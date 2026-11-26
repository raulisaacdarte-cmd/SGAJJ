'use client';

import React, { useEffect, useState } from 'react';
import {
  Building2,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileCheck2,
  Landmark,
  Receipt,
  Upload,
  XCircle,
} from 'lucide-react';
import {
  AJJ_BENEFICIARY_NAME,
  AJJ_INSTITUTIONAL_IBAN_AO06,
  AJJ_INSTITUTIONAL_IBAN_DISPLAY,
  ANGOLAN_BANKS,
  type AngolanBankCode,
  buildAngolanBankPaymentInstructions,
  formatAoa,
} from '@/lib/domain';
import { downloadRupePaymentGuidePdf } from '@/lib/pdf';

export interface QuotaRupeRecord {
  id: number;
  rupe_code: string;
  rupe_formatted: string;
  member_id: number | null;
  member_name?: string | null;
  member_code?: string | null;
  province_id: number | null;
  province_name?: string | null;
  reference_month: string;
  amount_aoa: number;
  bank_code: AngolanBankCode;
  bank_name: string;
  beneficiary_iban: string;
  beneficiary_iban_ao06: string;
  beneficiary_name: string;
  status: 'AGUARDA_PAGAMENTO' | 'COMPROVATIVO_SUBMETIDO' | 'PAGO' | 'EXPIRADO' | 'CANCELADO';
  expires_at: string;
  proof_reference: string;
  proof_path: string | null;
  receipt_number: string | null;
  notes: string;
  created_at: string;
}

interface BankConfigResponse {
  beneficiaryName: string;
  bankName: string;
  ibanRaw: string;
  ibanDisplay: string;
  ibanAo06: string;
  banks: typeof ANGOLAN_BANKS;
}

interface QuotaRupePanelProps {
  mode: 'TREASURY' | 'MEMBER';
  canNationalFinance?: boolean;
  membersList?: Array<{ id: number; full_name: string; member_code: string; monthly_quota_aoa?: number }>;
  defaultMemberId?: number | null;
  defaultAmountAoa?: number;
  onSettled?: () => void;
}

export function QuotaRupePanel({
  mode,
  canNationalFinance = false,
  membersList = [],
  defaultMemberId = null,
  defaultAmountAoa = 2500,
  onSettled,
}: QuotaRupePanelProps) {
  const [rupes, setRupes] = useState<QuotaRupeRecord[]>([]);
  const [bankConfig, setBankConfig] = useState<BankConfigResponse>({
    beneficiaryName: AJJ_BENEFICIARY_NAME,
    bankName: 'Banco BAI (0040)',
    ibanRaw: '004000009661438910160',
    ibanDisplay: AJJ_INSTITUTIONAL_IBAN_DISPLAY,
    ibanAo06: AJJ_INSTITUTIONAL_IBAN_AO06,
    banks: ANGOLAN_BANKS,
  });
  const [selectedBank, setSelectedBank] = useState<AngolanBankCode>('BAI');
  const [selectedMemberId, setSelectedMemberId] = useState<string>(defaultMemberId ? String(defaultMemberId) : '');
  const [referenceMonth, setReferenceMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [amountOverride, setAmountOverride] = useState<string | null>(null);
  const amountAoa = amountOverride ?? String(defaultAmountAoa > 0 ? defaultAmountAoa : 2500);
  const setAmountAoa = (value: string) => setAmountOverride(value);
  const [filterBank, setFilterBank] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  const [activeRupe, setActiveRupe] = useState<QuotaRupeRecord | null>(null);
  const [copiedKey, setCopiedKey] = useState<string>('');
  const [proofRupeId, setProofRupeId] = useState<number | null>(null);
  const [proofRef, setProofRef] = useState<string>('');
  const [proofPath, setProofPath] = useState<string>('');
  const [uploadingProof, setUploadingProof] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (filterBank) params.set('bankCode', filterBank);
    if (filterStatus) params.set('status', filterStatus);

    fetch(`/api/finance/rupe?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data.rupes)) {
          setRupes(data.rupes);
          setActiveRupe((prev) => {
            if (prev) {
              const refreshed = data.rupes.find((x: QuotaRupeRecord) => x.id === prev.id);
              return refreshed || prev;
            }
            return data.rupes[0] || null;
          });
        }
        if (data.bankConfig) setBankConfig(data.bankConfig);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [filterBank, filterStatus, reloadTick]);

  function copyText(key: string, value: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(''), 2000);
    }
  }

  function handleMemberSelectChange(val: string) {
    setSelectedMemberId(val);
    const found = membersList.find((m) => String(m.id) === val);
    if (found?.monthly_quota_aoa && found.monthly_quota_aoa > 0) {
      setAmountAoa(String(found.monthly_quota_aoa));
    }
  }

  async function handleGenerateRupe(e: React.FormEvent) {
    e.preventDefault();
    setGenerating(true);
    setFeedback('');
    setErrorMsg('');
    try {
      const res = await fetch('/api/finance/rupe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bank_code: selectedBank,
          member_id: mode === 'TREASURY' && selectedMemberId ? Number(selectedMemberId) : undefined,
          reference_month: referenceMonth,
          amount_aoa: Number(amountAoa),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Não foi possível gerar o RUPE automático.');
        return;
      }
      setActiveRupe(data.rupe);
      setFeedback(
        `RUPE ${data.rupe.rupe_formatted} gerado automaticamente para ${data.rupe.bank_name} com base no IBAN ${data.rupe.beneficiary_iban}.`
      );
      setReloadTick((t) => t + 1);
    } finally {
      setGenerating(false);
    }
  }

  async function handleUploadProofFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingProof(true);
    setErrorMsg('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'documents');
      const res = await fetch('/api/uploads', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Falha ao carregar o comprovativo.');
        return;
      }
      setProofPath(data.filePath || '');
    } finally {
      setUploadingProof(false);
    }
  }

  async function handleSubmitProof(e: React.FormEvent) {
    e.preventDefault();
    if (!proofRupeId) return;
    setBusyId(proofRupeId);
    setFeedback('');
    setErrorMsg('');
    try {
      const res = await fetch('/api/finance/rupe', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: proofRupeId,
          action: 'SUBMIT_PROOF',
          proof_reference: proofRef,
          proof_path: proofPath || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Não foi possível submeter o comprovativo.');
        return;
      }
      setFeedback('Comprovativo bancário submetido à Tesouraria para validação e emissão de recibo.');
      setProofRupeId(null);
      setProofRef('');
      setProofPath('');
      setReloadTick((t) => t + 1);
    } finally {
      setBusyId(null);
    }
  }

  async function handleRupeAction(
    id: number,
    action: 'CONFIRM_PAYMENT' | 'REJECT_PROOF' | 'CANCEL',
    settlementScope?: 'NACIONAL' | 'PROVINCIAL'
  ) {
    setBusyId(id);
    setFeedback('');
    setErrorMsg('');
    try {
      const res = await fetch('/api/finance/rupe', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          action,
          ...(settlementScope ? { settlement_scope: settlementScope } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Erro ao processar operação no RUPE.');
        return;
      }
      if (action === 'CONFIRM_PAYMENT') {
        setFeedback(`Pagamento confirmado! Recibo oficial ${data.receipt_number} emitido e quota liquidada.`);
        onSettled?.();
      } else if (action === 'REJECT_PROOF') {
        setFeedback('Comprovativo devolvido para nova submissão.');
      } else {
        setFeedback('Referência RUPE cancelada.');
      }
      setReloadTick((t) => t + 1);
    } finally {
      setBusyId(null);
    }
  }

  const activeInstructions = activeRupe
    ? buildAngolanBankPaymentInstructions({
        bankCode: activeRupe.bank_code,
        rupeFormatted: activeRupe.rupe_formatted,
        amountAoa: activeRupe.amount_aoa,
        ibanDisplay: activeRupe.beneficiary_iban,
        ibanAo06: activeRupe.beneficiary_iban_ao06,
        referenceMonth: activeRupe.reference_month,
        memberCode: activeRupe.member_code,
      })
    : null;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-5">
      {/* Header + Institutional BAI IBAN */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#A6863A]">
            Banca Angolana &amp; Referência Automática RUPE
          </p>
          <h3 className="text-base font-bold text-[#0B1F3A] dark:text-white flex items-center gap-2 mt-0.5">
            <Landmark className="h-4 w-4 text-[#A6863A]" />
            Pagamento de Quotas — BAI, BIC, BFA, BCI &amp; Multicaixa Express
          </h3>
        </div>

        <div className="rounded-lg border border-[#A6863A]/40 bg-slate-50 dark:bg-[#071121] px-4 py-2.5 flex flex-col sm:flex-row sm:items-center gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              IBAN Institucional AJJ ({bankConfig.bankName})
            </p>
            <p className="font-mono-tabular text-xs font-bold text-[#0B1F3A] dark:text-[#C5A24D]">
              {bankConfig.ibanAo06}
            </p>
            <p className="font-mono-tabular text-[11px] text-slate-500">{bankConfig.ibanDisplay}</p>
          </div>
          <button
            type="button"
            onClick={() => copyText('iban', bankConfig.ibanDisplay)}
            className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1B30] px-2.5 py-1.5 text-[11px] font-semibold hover:border-[#A6863A] cursor-pointer shrink-0"
          >
            {copiedKey === 'iban' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copiedKey === 'iban' ? 'IBAN Copiado' : 'Copiar IBAN'}
          </button>
        </div>
      </div>

      {feedback && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 p-3 text-xs text-emerald-800 dark:text-emerald-300">
          {feedback}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 p-3 text-xs text-red-700 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {/* Bank Selection + RUPE Generator Form */}
      <form onSubmit={handleGenerateRupe} className="space-y-4">
        <div>
          <span className="block text-xs font-semibold mb-2 text-slate-700 dark:text-slate-200">
            1. Selecione o Banco / Canal Financeiro Angolano
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            {bankConfig.banks.map((bank) => {
              const active = selectedBank === bank.code;
              return (
                <button
                  key={bank.code}
                  type="button"
                  onClick={() => setSelectedBank(bank.code)}
                  className={`rounded-lg border p-3 text-left transition-colors cursor-pointer ${
                    active
                      ? 'border-[#A6863A] bg-[#0B1F3A] text-white dark:bg-[#A6863A]/20 dark:text-white'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#071121] hover:border-[#A6863A]/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold">{bank.shortName}</span>
                    <span
                      className={`font-mono-tabular text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        active ? 'bg-[#A6863A] text-white' : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {bank.bnaCode}
                    </span>
                  </div>
                  <p className={`text-[11px] mt-1 line-clamp-1 ${active ? 'text-slate-200' : 'text-slate-500'}`}>
                    {bank.channels[0]}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          {mode === 'TREASURY' && (
            <div>
              <label htmlFor="rupe-member-select" className="block text-xs font-semibold mb-1">
                Associado
              </label>
              <select
                id="rupe-member-select"
                value={selectedMemberId}
                onChange={(e) => handleMemberSelectChange(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
              >
                <option value="">Guia institucional / Associado atual</option>
                {membersList.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.member_code} — {m.full_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="rupe-month-input" className="block text-xs font-semibold mb-1">
              Mês de Referência *
            </label>
            <input
              id="rupe-month-input"
              type="month"
              required
              value={referenceMonth}
              onChange={(e) => setReferenceMonth(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
            />
          </div>

          <div>
            <label htmlFor="rupe-amount-input" className="block text-xs font-semibold mb-1">
              Valor da Quota (AOA) *
            </label>
            <input
              id="rupe-amount-input"
              type="number"
              min="1"
              step="1"
              required
              value={amountAoa}
              onChange={(e) => setAmountAoa(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs font-mono-tabular"
            />
          </div>

          <div className={mode === 'MEMBER' ? 'sm:col-span-2 lg:col-span-2 flex justify-start' : ''}>
            <button
              type="submit"
              disabled={generating}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-5 py-2 text-xs font-semibold text-white cursor-pointer disabled:opacity-60"
            >
              <Receipt className="h-3.5 w-3.5" />
              {generating ? 'A gerar RUPE...' : 'Gerar RUPE Automático'}
            </button>
          </div>
        </div>
      </form>

      {/* Active Generated RUPE Card */}
      {activeRupe && activeInstructions && (
        <div className="rounded-xl border border-[#A6863A]/40 bg-slate-50 dark:bg-[#071121] p-4 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#A6863A]">
                Referência RUPE Gerada · {activeRupe.bank_name}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="font-mono-tabular text-lg font-bold tracking-wide text-[#0B1F3A] dark:text-white">
                  {activeRupe.rupe_formatted}
                </span>
                <button
                  type="button"
                  onClick={() => copyText(`rupe-${activeRupe.id}`, activeRupe.rupe_code)}
                  className="inline-flex items-center gap-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1B30] px-2 py-1 text-[11px] font-semibold cursor-pointer"
                >
                  {copiedKey === `rupe-${activeRupe.id}` ? (
                    <Check className="h-3 w-3 text-emerald-600" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  {copiedKey === `rupe-${activeRupe.id}` ? 'Copiado' : 'Copiar RUPE'}
                </button>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                Montante: <strong className="font-mono-tabular">{formatAoa(activeRupe.amount_aoa)}</strong> · Quota:{' '}
                <strong className="font-mono-tabular">{activeRupe.reference_month}</strong> · IBAN destino:{' '}
                <span className="font-mono-tabular">{activeRupe.beneficiary_iban}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => downloadRupePaymentGuidePdf(activeRupe)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1B30] px-3 py-1.5 text-xs font-semibold cursor-pointer"
              >
                <Download className="h-3.5 w-3.5 text-[#A6863A]" /> Guia RUPE (PDF)
              </button>
              {activeRupe.status !== 'PAGO' && activeRupe.status !== 'CANCELADO' && (
                <button
                  type="button"
                  onClick={() => {
                    setProofRupeId(activeRupe.id);
                    setProofRef(activeRupe.proof_reference || '');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
                >
                  <FileCheck2 className="h-3.5 w-3.5" /> Submeter Comprovativo
                </button>
              )}
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
            <p className="text-xs font-semibold text-[#0B1F3A] dark:text-white mb-1.5">
              {activeInstructions.channelTitle}
            </p>
            <ol className="list-decimal list-inside space-y-1 text-xs text-slate-600 dark:text-slate-300">
              {activeInstructions.steps.map((s, idx) => (
                <li key={idx}>{s}</li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {/* Proof Submission Modal/Drawer */}
      {proofRupeId !== null && (
        <form
          onSubmit={handleSubmitProof}
          className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/20 p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-[#0B1F3A] dark:text-white">
              Submeter Comprovativo Bancário (RUPE #{proofRupeId})
            </p>
            <button
              type="button"
              onClick={() => setProofRupeId(null)}
              className="text-xs text-slate-500 hover:underline cursor-pointer"
            >
              Fechar
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="proof-ref-input" className="block text-xs font-semibold mb-1">
                N.º da Operação / Referência do Borderô *
              </label>
              <input
                id="proof-ref-input"
                required={!proofPath}
                value={proofRef}
                onChange={(e) => setProofRef(e.target.value)}
                placeholder="Ex.: BAI-OP-9843120 / Borderô 2026"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label htmlFor="proof-file-input" className="block text-xs font-semibold mb-1">
                Anexar Comprovativo (PDF/Imagem, opcional)
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs cursor-pointer">
                <Upload className="h-3.5 w-3.5 text-[#A6863A]" />
                <span className="truncate">
                  {uploadingProof ? 'A enviar...' : proofPath ? 'Comprovativo anexado' : 'Selecionar ficheiro'}
                </span>
                <input
                  id="proof-file-input"
                  type="file"
                  accept=".pdf,image/*"
                  onChange={handleUploadProofFile}
                  className="hidden"
                />
              </label>
            </div>
          </div>
          <button
            type="submit"
            disabled={busyId === proofRupeId || uploadingProof}
            className="rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-4 py-1.5 text-xs font-semibold text-white cursor-pointer"
          >
            Enviar Comprovativo para Tesouraria
          </button>
        </form>
      )}

      {/* RUPE Ledger Table */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-[#A6863A]" />
            RUPEs Gerados e Liquidações Bancárias ({rupes.length})
          </h4>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Filtrar por banco"
              value={filterBank}
              onChange={(e) => setFilterBank(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-2.5 py-1 text-xs"
            >
              <option value="">Todos os Bancos</option>
              {bankConfig.banks.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.shortName}
                </option>
              ))}
            </select>
            <select
              aria-label="Filtrar por estado"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-2.5 py-1 text-xs"
            >
              <option value="">Todos os Estados</option>
              <option value="AGUARDA_PAGAMENTO">Aguarda Pagamento</option>
              <option value="COMPROVATIVO_SUBMETIDO">Comprovativo Submetido</option>
              <option value="PAGO">Pago</option>
              <option value="EXPIRADO">Expirado</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
          </div>
        </div>

        {rupes.length === 0 ? (
          <p className="text-xs text-slate-500 py-3">
            Nenhum RUPE gerado ainda. Selecione um banco angolano acima para gerar o primeiro RUPE automático.
          </p>
        ) : (
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th className="py-2 pr-3 font-semibold">RUPE / IBAN</th>
                  <th className="py-2 pr-3 font-semibold">Banco / Associado</th>
                  <th className="py-2 pr-3 font-semibold">Mês</th>
                  <th className="py-2 pr-3 text-right font-semibold">Valor</th>
                  <th className="py-2 pr-3 font-semibold">Estado / Comprovativo</th>
                  <th className="py-2 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rupes.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="py-2.5 pr-3 font-mono-tabular">
                      <button
                        type="button"
                        onClick={() => setActiveRupe(r)}
                        className="font-bold text-[#0B1F3A] dark:text-[#C5A24D] hover:underline cursor-pointer text-left"
                      >
                        {r.rupe_formatted}
                      </button>
                      <p className="text-[11px] text-slate-500">{r.beneficiary_iban}</p>
                    </td>
                    <td className="py-2.5 pr-3">
                      <p className="font-semibold text-[#0B1F3A] dark:text-white">{r.bank_code}</p>
                      <p className="text-[11px] text-slate-500">
                        {r.member_name ? `${r.member_name} (${r.member_code})` : 'Guia Tesouraria'}
                      </p>
                    </td>
                    <td className="py-2.5 pr-3 font-mono-tabular">{r.reference_month}</td>
                    <td className="py-2.5 pr-3 text-right font-mono-tabular font-semibold">
                      {formatAoa(r.amount_aoa)}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`font-semibold text-[11px] ${
                          r.status === 'PAGO'
                            ? 'text-emerald-600'
                            : r.status === 'COMPROVATIVO_SUBMETIDO'
                              ? 'text-blue-600 dark:text-blue-400'
                              : r.status === 'CANCELADO' || r.status === 'EXPIRADO'
                                ? 'text-red-600'
                                : 'text-[#A6863A]'
                        }`}
                      >
                        {r.status}
                      </span>
                      {r.proof_reference && (
                        <p className="text-[11px] text-slate-500 font-mono-tabular">Ref: {r.proof_reference}</p>
                      )}
                      {r.receipt_number && (
                        <p className="text-[11px] text-emerald-600 font-mono-tabular">{r.receipt_number}</p>
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="inline-flex flex-wrap justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => downloadRupePaymentGuidePdf(r)}
                          className="rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-[11px] font-semibold cursor-pointer"
                        >
                          Guia PDF
                        </button>
                        {r.status !== 'PAGO' && r.status !== 'CANCELADO' && (
                          <button
                            type="button"
                            onClick={() => {
                              setProofRupeId(r.id);
                              setProofRef(r.proof_reference || '');
                            }}
                            className="rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-[11px] font-semibold cursor-pointer"
                          >
                            Comprovativo
                          </button>
                        )}
                        {mode === 'TREASURY' && r.status !== 'PAGO' && r.status !== 'CANCELADO' && (
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() =>
                              handleRupeAction(
                                r.id,
                                'CONFIRM_PAYMENT',
                                canNationalFinance ? 'NACIONAL' : 'PROVINCIAL'
                              )
                            }
                            className="inline-flex items-center gap-0.5 rounded bg-emerald-600 text-white px-2 py-1 text-[11px] font-semibold cursor-pointer disabled:opacity-60"
                          >
                            <CheckCircle2 className="h-3 w-3" /> Confirmar
                          </button>
                        )}
                        {mode === 'TREASURY' && r.status === 'COMPROVATIVO_SUBMETIDO' && (
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => handleRupeAction(r.id, 'REJECT_PROOF')}
                            className="inline-flex items-center gap-0.5 rounded bg-amber-600 text-white px-2 py-1 text-[11px] font-semibold cursor-pointer disabled:opacity-60"
                          >
                            <XCircle className="h-3 w-3" /> Rejeitar
                          </button>
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
    </div>
  );
}
