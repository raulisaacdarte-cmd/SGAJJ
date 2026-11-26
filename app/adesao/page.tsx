'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Mail, MessageSquare, RefreshCw, Search, Upload, UserCheck } from 'lucide-react';
import { PublicHeader } from '@/components/PublicHeader';
import { PublicFooter } from '@/components/PublicFooter';
import { APPLICATION_STATUS_LABELS } from '@/lib/domain';

interface Province {
  id: number;
  code: string;
  name: string;
}

interface Municipality {
  id: number;
  province_id: number;
  name: string;
}

interface Category {
  id: number;
  code: string;
  name: string;
  monthly_quota_aoa: number;
  description: string;
}

export default function AdesaoPage() {
  const [tab, setTab] = useState<'form' | 'track' | 'categories'>('form');
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  // Form state
  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [provinceId, setProvinceId] = useState('');
  const [municipalityId, setMunicipalityId] = useState('');
  const [institution, setInstitution] = useState('');
  const [academicDegree, setAcademicDegree] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [motivation, setMotivation] = useState('');
  const [photoPath, setPhotoPath] = useState('');
  const [docs, setDocs] = useState<Array<{ fileName: string; filePath: string }>>([]);
  const [consent, setConsent] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submittedTracking, setSubmittedTracking] = useState('');
  const [emailDelivery, setEmailDelivery] = useState<{
    logId: number;
    status: string;
    provider: string;
    emailMasked: string;
    sentAt: string | null;
    errorMessage?: string | null;
    gatewayConfigured?: boolean;
  } | null>(null);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [emailResendMsg, setEmailResendMsg] = useState('');
  const [emailResendErr, setEmailResendErr] = useState('');
  const [smsDelivery, setSmsDelivery] = useState<{
    logId: number;
    status: string;
    provider: string;
    phoneMasked: string;
    sentAt: string | null;
    messagePreview: string;
    errorMessage?: string | null;
  } | null>(null);
  const [resendingSms, setResendingSms] = useState(false);
  const [smsResendMsg, setSmsResendMsg] = useState('');

  // Tracking lookup
  const [trackingQuery, setTrackingQuery] = useState('');
  const [trackingResult, setTrackingResult] = useState<{
    tracking_number: string;
    full_name: string;
    status: string;
    reviewer_notes: string;
    province_name: string;
    category_name: string;
    member_code: string | null;
    created_at: string;
  } | null>(null);
  const [trackingError, setTrackingError] = useState('');

  useEffect(() => {
    fetch('/api/public/catalog')
      .then((r) => r.json())
      .then((data) => {
        const activeProvinces = (data.provinces || []).filter((p: Province & { is_active?: number }) => p.is_active !== 0);
        setProvinces(activeProvinces);
        setMunicipalities(data.municipalities || []);
        setCategories(data.categories || []);
        if (data.categories?.length) {
          setCategoryId(String(data.categories[0].id));
        }
      })
      .catch(() => {});
  }, []);

  const filteredMunicipalities = municipalities.filter((m) => String(m.province_id) === provinceId);

  async function handleFileUpload(file: File, kind: 'photo' | 'doc') {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', kind === 'photo' ? 'photos' : 'applications');
    const res = await fetch('/api/uploads', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Erro ao carregar ficheiro.');
      return;
    }
    if (kind === 'photo') {
      setPhotoPath(data.filePath);
    } else {
      setDocs((prev) => [...prev, { fileName: data.fileName, filePath: data.filePath }]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          birth_date: birthDate,
          id_number: idNumber,
          phone,
          email,
          province_id: Number(provinceId),
          municipality_id: municipalityId ? Number(municipalityId) : null,
          institution,
          academic_degree: academicDegree,
          category_id: Number(categoryId),
          photo_path: photoPath || null,
          documents: docs,
          motivation,
          consent_accepted: consent,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Não foi possível submeter a candidatura.');
      } else {
        setSubmittedTracking(data.tracking_number);
        setTrackingQuery(data.tracking_number);
        setEmailDelivery(data.emailDelivery || null);
        setEmailResendMsg('');
        setEmailResendErr('');
        setSmsDelivery(data.smsDelivery || null);
        setSmsResendMsg('');
      }
    } catch {
      setError('Falha de ligação ao servidor.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResendActivationEmail() {
    if (!email) return;
    setResendingEmail(true);
    setEmailResendMsg('');
    setEmailResendErr('');
    try {
      const res = await fetch('/api/auth/resend-activation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          tracking_number: submittedTracking,
        }),
      });
      const data = await res.json();
      if (data.emailDelivery) {
        setEmailDelivery(data.emailDelivery);
      }
      if (!res.ok || data.success === false) {
        setEmailResendErr(data.message || data.error || 'Não foi possível reenviar o e-mail de ativação.');
      } else {
        setEmailResendMsg(data.message || 'Novo e-mail de ativação processado.');
      }
    } catch {
      setEmailResendErr('Erro de comunicação ao reenviar e-mail de ativação.');
    } finally {
      setResendingEmail(false);
    }
  }

  async function handleResendCandidateSms() {
    if (!submittedTracking || !phone) return;
    setResendingSms(true);
    setSmsResendMsg('');
    try {
      const res = await fetch('/api/sms/candidate-resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracking_number: submittedTracking,
          phone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSmsResendMsg(data.error || 'Não foi possível reenviar o SMS.');
      } else if (data.smsDelivery) {
        setSmsDelivery((prev) => ({
          ...(prev || { messagePreview: data.smsDelivery.message }),
          ...data.smsDelivery,
          messagePreview: data.smsDelivery.message || prev?.messagePreview || '',
        }));
        setSmsResendMsg('Novo pedido de envio de SMS processado com sucesso.');
      }
    } catch {
      setSmsResendMsg('Erro de comunicação ao reenviar SMS.');
    } finally {
      setResendingSms(false);
    }
  }

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setTrackingError('');
    setTrackingResult(null);
    if (!trackingQuery.trim()) return;
    const res = await fetch(`/api/applications?tracking=${encodeURIComponent(trackingQuery.trim())}`);
    const data = await res.json();
    if (!res.ok) {
      setTrackingError(data.error || 'Candidatura não encontrada.');
    } else {
      setTrackingResult(data.application);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9FB] dark:bg-[#071121]">
      <PublicHeader />

      <main className="flex-1 mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="space-y-3 mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#A6863A] dark:text-[#C5A24D]">
            Portal Público de Adesão · Associação de Jovens Juristas
          </p>
          <h1 className="font-serif-display text-3xl sm:text-4xl font-bold text-[#0B1F3A] dark:text-white">
            Inscrição e Admissão de Associados
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-3xl">
            Submeta a sua candidatura oficial para integrar a AJJ em qualquer uma das 18 províncias de Angola, acompanhe o andamento do processo e receba o seu código permanente de associado após aprovação estatutária.
          </p>
        </div>

        {/* Segmented Control */}
        <div className="inline-flex flex-wrap gap-1 rounded-lg bg-slate-200/70 dark:bg-slate-800/80 p-1 mb-8">
          <button
            type="button"
            onClick={() => setTab('form')}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition whitespace-nowrap cursor-pointer ${
              tab === 'form'
                ? 'bg-white dark:bg-[#0D1B30] text-[#0B1F3A] dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Formulário de Inscrição
          </button>
          <button
            type="button"
            onClick={() => setTab('track')}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition whitespace-nowrap cursor-pointer ${
              tab === 'track'
                ? 'bg-white dark:bg-[#0D1B30] text-[#0B1F3A] dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Acompanhar Candidatura
          </button>
          <button
            type="button"
            onClick={() => setTab('categories')}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition whitespace-nowrap cursor-pointer ${
              tab === 'categories'
                ? 'bg-white dark:bg-[#0D1B30] text-[#0B1F3A] dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Requisitos e Categorias
          </button>
        </div>

        {tab === 'form' && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 sm:p-8">
            {submittedTracking ? (
              <div className="py-6 space-y-6">
                <div className="text-center space-y-3">
                  <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
                  <h2 className="font-serif-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
                    Inscrição Realizada com Sucesso
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Guarde o seu número oficial de acompanhamento:
                  </p>
                  <p className="font-mono-tabular text-2xl font-bold text-[#A6863A] dark:text-[#C5A24D]">
                    {submittedTracking}
                  </p>
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                    Estado da conta: Conta pendente de ativação
                  </p>
                </div>

                {emailDelivery && (
                  <div
                    data-testid="candidate-email-activation"
                    className="mx-auto max-w-xl rounded-xl border border-[#A6863A]/40 bg-[#F8F9FB] dark:bg-[#071121] p-5 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#0B1F3A] dark:text-white">
                        <Mail className="h-4 w-4 text-[#A6863A]" />
                        <span>Ativação de Conta por E-mail («ATIVAR MINHA CONTA»)</span>
                      </div>
                      <span
                        className={`text-[11px] font-bold ${
                          emailDelivery.status === 'ENVIADO_GATEWAY'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : emailDelivery.status === 'FALHA_ENVIO'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {emailDelivery.status === 'ENVIADO_GATEWAY'
                          ? 'E-mail de Ativação Enviado'
                          : emailDelivery.status === 'FALHA_ENVIO'
                            ? 'Falha no Envio do E-mail'
                            : 'Servidor SMTP/API Não Configurado'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <p>
                        Destinatário: <span className="font-mono-tabular font-semibold">{emailDelivery.emailMasked}</span>
                      </p>
                      <p>
                        Canal: <span className="font-mono-tabular font-semibold">{emailDelivery.provider}</span>
                      </p>
                    </div>

                    {emailDelivery.status === 'ENVIADO_GATEWAY' ? (
                      <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/30 p-3 text-xs text-emerald-900 dark:text-emerald-200">
                        Enviámos uma mensagem institucional da AJJ para o seu endereço eletrónico com o botão{' '}
                        <strong>«ATIVAR MINHA CONTA»</strong>. Abra o e-mail (e verifique a pasta de spam) para definir a
                        sua palavra-passe pessoal. O link é válido por 48 horas e de utilização única.
                      </div>
                    ) : (
                      <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>
                          {emailDelivery.status === 'FALHA_ENVIO'
                            ? `Não foi possível entregar a mensagem no servidor de e-mail (${emailDelivery.errorMessage || 'erro de transporte'}). Utilize o botão de reenvio abaixo ou contacte o Secretariado.`
                            : 'A inscrição e o token seguro de ativação foram gerados, mas nenhuma credencial de envio externo (SMTP_HOST/SMTP_USER/SMTP_PASS, RESEND_API_KEY ou SENDGRID_API_KEY) está configurada no servidor.'}
                        </span>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        data-testid="resend-activation-email-btn"
                        disabled={resendingEmail}
                        onClick={handleResendActivationEmail}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 cursor-pointer"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${resendingEmail ? 'animate-spin' : ''}`} />
                        {resendingEmail ? 'A reenviar e-mail...' : 'Reenviar E-mail de Ativação'}
                      </button>
                      {emailResendMsg && (
                        <span className="text-xs text-emerald-700 dark:text-emerald-300">{emailResendMsg}</span>
                      )}
                      {emailResendErr && (
                        <span className="text-xs text-red-600 dark:text-red-400">{emailResendErr}</span>
                      )}
                    </div>
                  </div>
                )}

                {smsDelivery && (
                  <div
                    data-testid="candidate-sms-confirmation"
                    className="mx-auto max-w-xl rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F9FB] dark:bg-[#071121] p-5 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#0B1F3A] dark:text-white">
                        <MessageSquare className="h-4 w-4 text-[#A6863A]" />
                        <span>Confirmação de Inscrição por SMS</span>
                      </div>
                      <span
                        className={`text-[11px] font-bold ${
                          smsDelivery.status === 'ENVIADO_GATEWAY'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : smsDelivery.status === 'FALHA_ENVIO'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-[#A6863A] dark:text-[#C5A24D]'
                        }`}
                      >
                        {smsDelivery.status === 'ENVIADO_GATEWAY'
                          ? 'Enviado via Operadora SMS'
                          : smsDelivery.status === 'FALHA_ENVIO'
                            ? 'Falha no Envio SMS'
                            : 'SMS Registado e Despachado'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <p>
                        Destinatário: <span className="font-mono-tabular font-semibold">{smsDelivery.phoneMasked}</span>
                      </p>
                      <p>
                        Canal: <span className="font-mono-tabular font-semibold">{smsDelivery.provider}</span>
                      </p>
                    </div>

                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-3 text-xs text-slate-700 dark:text-slate-200">
                      {smsDelivery.messagePreview}
                    </div>

                    {smsDelivery.errorMessage && (
                      <p className="text-xs text-red-600 dark:text-red-400">{smsDelivery.errorMessage}</p>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        disabled={resendingSms}
                        onClick={handleResendCandidateSms}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-[#0B1F3A] dark:text-white hover:border-[#A6863A] disabled:opacity-50 cursor-pointer"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        {resendingSms ? 'A reenviar SMS...' : 'Reenviar SMS de Confirmação'}
                      </button>
                      {smsResendMsg && (
                        <span className="text-xs text-emerald-700 dark:text-emerald-300">{smsResendMsg}</span>
                      )}
                    </div>
                  </div>
                )}

                <div className="pt-2 flex flex-wrap justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => setTab('track')}
                    className="rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-5 py-2.5 text-sm font-semibold text-white cursor-pointer"
                  >
                    Consultar Estado do Processo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSubmittedTracking('');
                      setEmailDelivery(null);
                      setEmailResendMsg('');
                      setEmailResendErr('');
                      setSmsDelivery(null);
                      setSmsResendMsg('');
                      setFullName('');
                      setEmail('');
                      setPhone('');
                      setIdNumber('');
                    }}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    Nova Candidatura
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/40 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300">
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="fullName" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Nome Completo *
                    </label>
                    <input
                      id="fullName"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Ex.: António Manuel Domingos"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label htmlFor="birthDate" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Data de Nascimento *
                    </label>
                    <input
                      id="birthDate"
                      type="date"
                      required
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label htmlFor="idNumber" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      N.º do Bilhete de Identidade (Encriptado)
                    </label>
                    <input
                      id="idNumber"
                      value={idNumber}
                      onChange={(e) => setIdNumber(e.target.value)}
                      placeholder="Ex.: 005412987LA042"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label htmlFor="phone" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Contacto Telefónico (para receção do SMS de confirmação) *
                    </label>
                    <input
                      id="phone"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+244 923 456 789"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Endereço Eletrónico *
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nome@exemplo.ao"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label htmlFor="categoryId" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Categoria de Associado *
                    </label>
                    <select
                      id="categoryId"
                      required
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="provinceId" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Província *
                    </label>
                    <select
                      id="provinceId"
                      required
                      value={provinceId}
                      onChange={(e) => {
                        setProvinceId(e.target.value);
                        setMunicipalityId('');
                      }}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
                    >
                      <option value="">Selecionar Província...</option>
                      {provinces.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="municipalityId" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Município
                    </label>
                    <select
                      id="municipalityId"
                      value={municipalityId}
                      onChange={(e) => setMunicipalityId(e.target.value)}
                      disabled={!provinceId}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white disabled:opacity-50"
                    >
                      <option value="">Selecionar Município...</option>
                      {filteredMunicipalities.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="institution" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Instituição de Ensino ou Entidade Profissional
                    </label>
                    <input
                      id="institution"
                      value={institution}
                      onChange={(e) => setInstitution(e.target.value)}
                      placeholder="Ex.: Faculdade de Direito / Escritório"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label htmlFor="academicDegree" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Formação Académica / Grau
                    </label>
                    <input
                      id="academicDegree"
                      value={academicDegree}
                      onChange={(e) => setAcademicDegree(e.target.value)}
                      placeholder="Ex.: Licenciatura em Direito / Frequência Universitária"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 border-t border-slate-200 dark:border-slate-800 pt-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Fotografia Tipo Passe (JPG/PNG)
                    </label>
                    <label className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-4 py-3 text-xs text-slate-600 dark:text-slate-300 cursor-pointer hover:border-[#A6863A]">
                      <Upload className="h-4 w-4 text-[#A6863A]" />
                      <span>{photoPath ? 'Fotografia carregada com sucesso' : 'Carregar fotografia do candidato'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleFileUpload(f, 'photo');
                        }}
                      />
                    </label>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Documentos Comprovativos (BI / Certificado / Declaração)
                    </label>
                    <label className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-4 py-3 text-xs text-slate-600 dark:text-slate-300 cursor-pointer hover:border-[#A6863A]">
                      <FileText className="h-4 w-4 text-[#A6863A]" />
                      <span>
                        {docs.length > 0 ? `${docs.length} documento(s) anexado(s)` : 'Anexar documentos (PDF/JPG/PNG)'}
                      </span>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleFileUpload(f, 'doc');
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <label htmlFor="motivation" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Nota de Motivação / Áreas de Interesse Jurídico
                  </label>
                  <textarea
                    id="motivation"
                    rows={3}
                    value={motivation}
                    onChange={(e) => setMotivation(e.target.value)}
                    placeholder="Descreva brevemente a sua motivação para integrar a Associação de Jovens Juristas..."
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
                  />
                </div>

                <label className="flex items-start gap-3 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300"
                  />
                  <span>
                    Declaro que aceito os Estatutos da Associação de Jovens Juristas (AJJ) e autorizo o tratamento dos meus dados pessoais nos termos da Lei n.º 22/11 (Lei da Proteção de Dados Pessoais da República de Angola).
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-6 py-3 text-sm font-semibold text-white hover:bg-[#132E54] dark:hover:bg-[#8E712F] disabled:opacity-50 cursor-pointer"
                >
                  <UserCheck className="h-4 w-4" />
                  {submitting ? 'A submeter candidatura...' : 'Submeter Candidatura Oficial'}
                </button>
              </form>
            )}
          </div>
        )}

        {tab === 'track' && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 sm:p-8 space-y-6">
            <form onSubmit={handleLookup} className="flex flex-col sm:flex-row gap-3">
              <input
                value={trackingQuery}
                onChange={(e) => setTrackingQuery(e.target.value)}
                placeholder="Introduza o número da candidatura (ex.: AJJ-CAND-2026-00001)"
                className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-4 py-2.5 text-sm text-slate-900 dark:text-white font-mono-tabular"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-5 py-2.5 text-sm font-semibold text-white cursor-pointer"
              >
                <Search className="h-4 w-4" />
                Consultar Processo
              </button>
            </form>

            {trackingError && <p className="text-sm text-red-600 dark:text-red-400">{trackingError}</p>}

            {trackingResult && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F8F9FB] dark:bg-[#071121] p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-4">
                  <div>
                    <p className="font-mono-tabular text-xs text-slate-500">{trackingResult.tracking_number}</p>
                    <h3 className="text-lg font-bold text-[#0B1F3A] dark:text-white">{trackingResult.full_name}</h3>
                  </div>
                  <span className="text-sm font-bold text-[#A6863A] dark:text-[#C5A24D]">
                    Estado: {APPLICATION_STATUS_LABELS[trackingResult.status] || trackingResult.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">Província</p>
                    <p className="font-medium text-slate-900 dark:text-white">{trackingResult.province_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Categoria</p>
                    <p className="font-medium text-slate-900 dark:text-white">{trackingResult.category_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Data de Submissão</p>
                    <p className="font-mono-tabular font-medium text-slate-900 dark:text-white">
                      {trackingResult.created_at.slice(0, 10)}
                    </p>
                  </div>
                </div>
                {trackingResult.member_code && (
                  <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 p-4">
                    <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                      Adesão Aprovada · Código Permanente de Associado
                    </p>
                    <p className="font-mono-tabular text-lg font-bold text-emerald-900 dark:text-emerald-200 mt-1">
                      {trackingResult.member_code}
                    </p>
                  </div>
                )}
                {trackingResult.reviewer_notes && (
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    <strong>Notas da análise:</strong> {trackingResult.reviewer_notes}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'categories' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-3"
              >
                <h3 className="font-serif-display text-xl font-bold text-[#0B1F3A] dark:text-white">{cat.name}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{cat.description}</p>
                <div className="border-t border-slate-200 dark:border-slate-800 pt-3 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Quota Estatutária Mensal</span>
                  <span className="font-mono-tabular font-bold text-[#A6863A] dark:text-[#C5A24D]">
                    {cat.monthly_quota_aoa > 0 ? `${cat.monthly_quota_aoa.toLocaleString('pt-AO')} AOA` : 'Isento'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <PublicFooter />
    </div>
  );
}
