'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import {
  Award,
  Bell,
  BookOpen,
  Calendar,
  Camera,
  CreditCard,
  Download,
  Laptop,
  MessageSquare,
  Save,
  Send,
  Shield,
  Trash2,
  UserCheck,
  Wallet,
} from 'lucide-react';
import { formatAoa, getPersonInitials } from '@/lib/domain';
import { downloadCertificatePdf, downloadFinancialReceiptPdf } from '@/lib/pdf';
import type { PanelProps } from './types';

interface MemberProfile {
  id: number;
  member_code: string;
  full_name: string;
  phone: string;
  email: string;
  province_id: number;
  province_name: string;
  municipality_id: number | null;
  municipality_name: string | null;
  institution: string;
  academic_degree: string;
  category_name: string;
  monthly_quota_aoa: number;
  photo_path: string | null;
  status: string;
  joined_at: string;
  card_number: string | null;
  qr_token: string | null;
}

interface QuotaRow {
  id: number;
  reference_month: string;
  amount_aoa: number;
  status: string;
  paid_at: string | null;
  receipt_number: string | null;
}

interface TransactionRow {
  id: number;
  receipt_number: string;
  type: string;
  category: string;
  description: string;
  amount_aoa: number;
  reference_date: string;
  scope: string;
}

interface ActivityItem {
  id: number;
  title: string;
  activity_type: string;
  location: string;
  start_datetime: string;
  province_name: string | null;
  approval_status: string;
}

interface RegistrationItem {
  id: number;
  activity_id: number;
  activity_title: string;
  activity_type: string;
  start_datetime: string;
  location: string;
  participant_name: string;
  certificate_code: string | null;
}

interface PublicationItem {
  id: number;
  slug: string;
  title: string;
  category: string;
  published_at: string | null;
}

interface NotificationItem {
  id: number;
  title: string;
  message: string;
  category: string;
  is_read: number;
  created_at: string;
}

interface SessionItem {
  id: number;
  user_agent: string;
  ip_address: string;
  trusted_device: number;
  expires_at: string;
  created_at: string;
}

export function MemberPortalModule({ user, catalog, onNavigateTab }: PanelProps) {
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [quotas, setQuotas] = useState<QuotaRow[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [registrations, setRegistrations] = useState<RegistrationItem[]>([]);
  const [publications, setPublications] = useState<PublicationItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Editable personal fields
  const [editName, setEditName] = useState(user.full_name);
  const [editPhone, setEditPhone] = useState(user.phone || '');
  const [editInstitution, setEditInstitution] = useState('');
  const [editDegree, setEditDegree] = useState('');
  const [editMunicipality, setEditMunicipality] = useState('');
  const [photoPath, setPhotoPath] = useState(user.photo_path || '');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Message to own provincial coordination
  const [msgSubject, setMsgSubject] = useState('');
  const [msgBody, setMsgBody] = useState('');

  const [feedback, setFeedback] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [memRes, finRes, actRes, pubRes, commRes, sessRes] = await Promise.all([
          fetch('/api/members').then((r) => r.json()),
          fetch('/api/finance').then((r) => r.json()),
          fetch('/api/activities').then((r) => r.json()),
          fetch('/api/publications').then((r) => r.json()),
          fetch('/api/communications').then((r) => r.json()),
          fetch('/api/auth/sessions').then((r) => r.json()),
        ]);

        if (cancelled) return;
        const mem = (memRes.members?.[0] || null) as MemberProfile | null;
        setProfile(mem);
        if (mem) {
          setEditName(mem.full_name);
          setEditPhone(mem.phone);
          setEditInstitution(mem.institution || '');
          setEditDegree(mem.academic_degree || '');
          setEditMunicipality(mem.municipality_id ? String(mem.municipality_id) : '');
          setPhotoPath(mem.photo_path || '');
        }
        setQuotas(finRes.quotas || []);
        setTransactions(finRes.transactions || []);
        setActivities((actRes.activities || []).filter((a: ActivityItem) => a.approval_status === 'APROVADA').slice(0, 6));
        setRegistrations(actRes.registrations || []);
        setPublications((pubRes.publications || []).slice(0, 4));
        setNotifications((commRes.notifications || []).slice(0, 6));
        setSessions(sessRes.sessions || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setUploadingPhoto(true);
    setErrorMsg('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'photos');
      const upRes = await fetch('/api/uploads', { method: 'POST', body: fd });
      const upData = await upRes.json();
      if (!upRes.ok) {
        setErrorMsg(upData.error || 'Erro ao carregar fotografia.');
        return;
      }
      const nextPhoto = upData.filePath as string;
      const patchRes = await fetch('/api/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: profile.id, photo_path: nextPhoto }),
      });
      if (patchRes.ok) {
        setPhotoPath(nextPhoto);
        setFeedback('Fotografia institucional atualizada com sucesso.');
        setReloadTick((t) => t + 1);
      }
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setFeedback('');
    setErrorMsg('');
    const res = await fetch('/api/members', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: profile.id,
        full_name: editName,
        phone: editPhone,
        institution: editInstitution,
        academic_degree: editDegree,
        municipality_id: editMunicipality ? Number(editMunicipality) : null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error || 'Não foi possível guardar os dados pessoais.');
    } else {
      setFeedback('Os seus dados pessoais foram atualizados.');
      setReloadTick((t) => t + 1);
    }
  }

  async function handleRegisterActivity(activityId: number) {
    setFeedback('');
    setErrorMsg('');
    const res = await fetch('/api/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'REGISTER',
        activity_id: activityId,
        participant_name: profile?.full_name || user.full_name,
        participant_email: profile?.email || user.email,
        participant_phone: profile?.phone || user.phone || '',
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error || 'Erro ao efetuar inscrição.');
    } else {
      setFeedback('Inscrição registada na atividade institucional.');
      setReloadTick((t) => t + 1);
    }
  }

  async function handleContactCoordination(e: React.FormEvent) {
    e.preventDefault();
    if (!user.province_id) return;
    setFeedback('');
    setErrorMsg('');
    const res = await fetch('/api/communications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_scope: 'COORDENACAO_ESPECIFICA',
        target_province_id: user.province_id,
        subject: msgSubject,
        body: msgBody,
        channels: ['IN_APP'],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error || 'Erro ao enviar mensagem.');
    } else {
      setFeedback('Mensagem enviada à sua Coordenação Provincial.');
      setMsgSubject('');
      setMsgBody('');
    }
  }

  async function handleMarkNotificationsRead() {
    await fetch('/api/communications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mark_all: true }),
    });
    setReloadTick((t) => t + 1);
  }

  async function handleRevokeSession(sessionId: number) {
    await fetch(`/api/auth/sessions?sessionId=${sessionId}`, { method: 'DELETE' });
    setFeedback('Sessão terminada com segurança.');
    setReloadTick((t) => t + 1);
  }

  if (loading) {
    return <p className="text-xs text-slate-500">A carregar área pessoal do associado...</p>;
  }

  const provinceMunicipalities = catalog.municipalities.filter(
    (m) => m.province_id === (profile?.province_id || user.province_id)
  );
  const registeredActivityIds = new Set(registrations.map((r) => r.activity_id));
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <motion.div
        whileHover={{ y: -2 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:border-[#A6863A]/60 hover:shadow-sm transition-colors"
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className="relative shrink-0">
            {photoPath ? (
              <img
                src={photoPath}
                alt={profile?.full_name || user.full_name}
                className="h-20 w-20 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
              />
            ) : (
              <div className="h-20 w-20 rounded-xl bg-[#0B1F3A] text-white flex items-center justify-center font-serif-display text-2xl font-bold">
                {getPersonInitials(profile?.full_name || user.full_name)}
              </div>
            )}
            <label
              title="Alterar fotografia"
              className="absolute -bottom-1.5 -right-1.5 h-7 w-7 rounded-lg bg-[#A6863A] text-white flex items-center justify-center cursor-pointer shadow"
            >
              <Camera className="h-3.5 w-3.5" />
              <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" disabled={uploadingPhoto} />
            </label>
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#A6863A]">Área Pessoal do Associado</p>
            <h2 className="font-serif-display text-2xl font-bold text-[#0B1F3A] dark:text-white truncate">
              {profile?.full_name || user.full_name}
            </h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
              <span className="font-mono-tabular font-bold text-[#0B1F3A] dark:text-[#C5A24D]">
                {profile?.member_code || user.member_code || 'Pendente'}
              </span>
              <span>·</span>
              <span>{profile?.category_name || 'Associado'}</span>
              <span>·</span>
              <span>{profile?.province_name || user.province_name || 'Nacional'}</span>
              <span>·</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {profile?.status || 'ATIVO'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onNavigateTab('cartao')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-4 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            <CreditCard className="h-4 w-4" /> Cartão Digital e QR
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab('documentos')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <BookOpen className="h-4 w-4" /> Regulamentos
          </button>
        </div>
      </motion.div>

      {feedback && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-xs text-emerald-700 dark:text-emerald-300">
          {feedback}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {/* Profile Update & Quotas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form
          onSubmit={handleSaveProfile}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-4"
        >
          <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-[#A6863A]" /> Dados Pessoais e Académicos
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Nome Completo</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Telefone</label>
              <input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Instituição / Faculdade</label>
              <input
                value={editInstitution}
                onChange={(e) => setEditInstitution(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Grau Académico</label>
              <input
                value={editDegree}
                onChange={(e) => setEditDegree(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold mb-1">Município de Residência</label>
              <select
                value={editMunicipality}
                onChange={(e) => setEditMunicipality(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
              >
                <option value="">Selecionar município</option>
                {provinceMunicipalities.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={!profile}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-4 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" /> Atualizar Perfil
          </button>
        </form>

        {/* Quotas & Receipts */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white flex items-center gap-2">
              <Wallet className="h-4 w-4 text-[#A6863A]" /> Histórico de Quotas e Recibos
            </h3>
            <span className="font-mono-tabular text-xs text-slate-500">
              Quota mensal: {formatAoa(profile?.monthly_quota_aoa || 0)}
            </span>
          </div>

          {quotas.length === 0 && transactions.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">
              Ainda não existem quotas ou recibos registados na sua ficha pessoal.
            </p>
          ) : (
            <div className="overflow-x-auto max-h-60 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <th className="py-2 pr-3">Mês / Data</th>
                    <th className="py-2 pr-3">Valor</th>
                    <th className="py-2 pr-3">Estado</th>
                    <th className="py-2 text-right">Recibo PDF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {quotas.map((q) => {
                    const matchedTx = transactions.find((t) => t.receipt_number === q.receipt_number);
                    return (
                      <tr key={q.id}>
                        <td className="py-2 pr-3 font-mono-tabular">{q.reference_month}</td>
                        <td className="py-2 pr-3 font-mono-tabular font-semibold">{formatAoa(q.amount_aoa)}</td>
                        <td className="py-2 pr-3">
                          <span className={q.status === 'PAGO' ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-semibold'}>
                            {q.status}
                          </span>
                        </td>
                        <td className="py-2 text-right">
                          {q.receipt_number && (
                            <button
                              type="button"
                              onClick={() =>
                                downloadFinancialReceiptPdf({
                                  receipt_number: q.receipt_number!,
                                  type: matchedTx?.type || 'QUOTA',
                                  category: matchedTx?.category || 'Quota Mensal',
                                  description: matchedTx?.description || `Quota referente a ${q.reference_month}`,
                                  amount_aoa: q.amount_aoa,
                                  reference_date: matchedTx?.reference_date || q.paid_at || q.reference_month,
                                  scope: matchedTx?.scope || 'PROVINCIAL',
                                  province_name: profile?.province_name || user.province_name,
                                })
                              }
                              className="inline-flex items-center gap-1 text-[#0B1F3A] dark:text-[#C5A24D] font-semibold hover:underline cursor-pointer"
                            >
                              <Download className="h-3.5 w-3.5" /> PDF
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Activities & Certificates */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-4">
          <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#A6863A]" /> Eventos e Formações Disponíveis
          </h3>
          {activities.length === 0 ? (
            <p className="text-xs text-slate-500">Nenhuma atividade institucional agendada no momento.</p>
          ) : (
            <div className="space-y-3">
              {activities.map((a) => {
                const already = registeredActivityIds.has(a.id);
                return (
                  <motion.div
                    key={a.id}
                    whileHover={{ y: -2, x: 2 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 flex items-center justify-between gap-3 hover:border-[#A6863A]/60 hover:shadow-sm transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#0B1F3A] dark:text-white truncate">{a.title}</p>
                      <p className="text-[11px] text-slate-500 font-mono-tabular">
                        {a.start_datetime.slice(0, 10)} · {a.location}
                      </p>
                    </div>
                    {already ? (
                      <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                        Inscrito(a)
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRegisterActivity(a.id)}
                        className="rounded-md bg-[#0B1F3A] dark:bg-[#A6863A] px-3 py-1.5 text-[11px] font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Inscrever-me
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-4">
          <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white flex items-center gap-2">
            <Award className="h-4 w-4 text-[#A6863A]" /> Meus Certificados e Inscrições
          </h3>
          {registrations.length === 0 ? (
            <p className="text-xs text-slate-500">Ainda não efetuou inscrições em formações ou conferências.</p>
          ) : (
            <div className="space-y-2.5">
              {registrations.map((reg) => (
                <motion.div
                  key={reg.id}
                  whileHover={{ y: -2, x: 2 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 flex items-center justify-between gap-3 hover:border-[#A6863A]/60 hover:shadow-sm transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#0B1F3A] dark:text-white truncate">{reg.activity_title}</p>
                    <p className="text-[11px] text-slate-500 font-mono-tabular">
                      {reg.start_datetime.slice(0, 10)} ·{' '}
                      {reg.certificate_code ? reg.certificate_code : 'Aguarda emissão de certificado'}
                    </p>
                  </div>
                  {reg.certificate_code && (
                    <button
                      type="button"
                      onClick={() =>
                        downloadCertificatePdf({
                          participant_name: reg.participant_name,
                          activity_title: reg.activity_title,
                          activity_type: reg.activity_type,
                          start_datetime: reg.start_datetime,
                          location: reg.location,
                          certificate_code: reg.certificate_code!,
                          verifyUrl: `${origin}/verificar/${reg.certificate_code}`,
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-md border border-[#A6863A]/40 px-2.5 py-1 text-[11px] font-semibold text-[#0B1F3A] dark:text-[#C5A24D] whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" /> Certificado
                    </button>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Editorial, Notifications & Contact Provincial Coordination */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-[#A6863A]" /> A Voz Jurídica
            </h3>
            <Link href="/voz-juridica" className="text-[11px] font-semibold text-[#A6863A] hover:underline">
              Ver portal
            </Link>
          </div>
          {publications.length === 0 ? (
            <p className="text-xs text-slate-500">Sem publicações recentes.</p>
          ) : (
            <div className="space-y-2.5">
              {publications.map((pub) => (
                <motion.div
                  key={pub.id}
                  whileHover={{ y: -2, x: 2 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                >
                  <Link
                    href={`/voz-juridica/${pub.slug}`}
                    className="block rounded-lg border border-slate-200 dark:border-slate-800 p-3 hover:border-[#A6863A] hover:shadow-sm transition-colors"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A6863A]">{pub.category}</p>
                    <p className="text-xs font-bold text-[#0B1F3A] dark:text-white line-clamp-2 mt-0.5">{pub.title}</p>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white flex items-center gap-2">
              <Bell className="h-4 w-4 text-[#A6863A]" /> Notificações Recentes
            </h3>
            {notifications.some((n) => n.is_read === 0) && (
              <button
                type="button"
                onClick={handleMarkNotificationsRead}
                className="text-[11px] font-semibold text-[#A6863A] hover:underline cursor-pointer"
              >
                Marcar lidas
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="text-xs text-slate-500">Nenhuma notificação registada.</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`rounded-lg border p-2.5 text-xs ${
                    n.is_read
                      ? 'border-slate-200 dark:border-slate-800 opacity-80'
                      : 'border-[#A6863A]/50 bg-[#A6863A]/5'
                  }`}
                >
                  <p className="font-semibold text-[#0B1F3A] dark:text-white">{n.title}</p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2">{n.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <form
          onSubmit={handleContactCoordination}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-3"
        >
          <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-[#A6863A]" /> Contactar Coordenação Provincial
          </h3>
          <p className="text-[11px] text-slate-500">
            Envie pedidos de esclarecimento, declarações ou sugestões diretamente à Coordenação de{' '}
            {profile?.province_name || user.province_name || 'Luanda'}.
          </p>
          <input
            required
            placeholder="Assunto"
            value={msgSubject}
            onChange={(e) => setMsgSubject(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
          />
          <textarea
            required
            rows={3}
            placeholder="Escreva a sua mensagem..."
            value={msgBody}
            onChange={(e) => setMsgBody(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-4 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Send className="h-3.5 w-3.5" /> Enviar Mensagem
          </button>
        </form>
      </div>

      {/* Active Sessions Security */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-3">
        <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white flex items-center gap-2">
          <Shield className="h-4 w-4 text-[#A6863A]" /> Sessões Ativas e Dispositivos
        </h3>
        {sessions.length === 0 ? (
          <p className="text-xs text-slate-500">Nenhuma sessão ativa encontrada.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {sessions.map((s) => (
              <div key={s.id} className="py-2.5 flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-3 min-w-0">
                  <Laptop className="h-4 w-4 text-[#A6863A] shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white truncate">{s.user_agent || 'Navegador SGAJJ'}</p>
                    <p className="text-[11px] text-slate-500 font-mono-tabular">
                      IP: {s.ip_address} · {s.trusted_device ? 'Dispositivo confiável' : 'Sessão normal'} · Expira:{' '}
                      {s.expires_at.slice(0, 10)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevokeSession(s.id)}
                  className="inline-flex items-center gap-1 rounded border border-red-300 px-2.5 py-1 text-[11px] font-semibold text-red-700 dark:text-red-400 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Terminar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
