'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Award, CheckCircle2, FileDown, FileText, ShieldAlert, Upload, UserCheck, UserX } from 'lucide-react';
import { downloadAppointmentDocumentPdf } from '@/lib/pdf';
import {
  getPersonInitials,
  isPresident,
  LEVEL2_PROVINCIAL_ROLE_CODES,
  requiresCentralValidationForLevel2,
} from '@/lib/domain';
import type { PanelProps } from './types';

interface AppointmentRow {
  id: number;
  level: number;
  province_id: number;
  province_name: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string;
  effective_photo_path: string | null;
  attachment_path: string | null;
  member_code: string | null;
  role_code: string;
  role_name: string;
  status: string;
  requires_central_validation: number;
  dispatch_number: string | null;
  term_of_office_number: string | null;
  start_date: string | null;
  end_date: string | null;
  duration_months: number;
  process_notes: string;
  appointed_by_name: string | null;
  validated_by_name: string | null;
  sms_status: string;
  termination_reason: string | null;
}

interface CandidateMemberRow {
  id: number;
  member_code: string;
  full_name: string;
  email: string;
  phone: string;
  province_id: number;
  province_name: string;
  academic_degree: string;
  institution: string;
  photo_path: string | null;
  joined_at: string;
  current_role_code: string | null;
}

export function AppointmentsModule({ user, catalog }: PanelProps) {
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [candidateMembers, setCandidateMembers] = useState<CandidateMemberRow[]>([]);
  const [loading, setLoading] = useState(true);

  const isPres = isPresident(user.role_code);
  const isCoord = user.role_code === 'COORD_PROVINCIAL';

  const [provinceId, setProvinceId] = useState(
    String(isCoord && user.province_id ? user.province_id : catalog.provinces[0]?.id || '')
  );
  const [roleCode, setRoleCode] = useState(isPres ? 'COORD_PROVINCIAL' : 'SEC_PROVINCIAL');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [candidateName, setCandidateName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [candidatePhone, setCandidatePhone] = useState('+244 ');
  const [candidatePhotoPath, setCandidatePhotoPath] = useState('');
  const [attachmentPath, setAttachmentPath] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [durationMonths, setDurationMonths] = useState('24');
  const [processNotes, setProcessNotes] = useState('');
  const [critIdoneidade, setCritIdoneidade] = useState(true);
  const [critFormacao, setCritFormacao] = useState(true);
  const [requiresCentral, setRequiresCentral] = useState(false);

  const [msg, setMsg] = useState('');
  const [activationLink, setActivationLink] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  const availableRoles = catalog.roles.filter((r) => {
    if (r.scope !== 'PROVINCIAL') return false;
    if (isPres) return true;
    return LEVEL2_PROVINCIAL_ROLE_CODES.includes(r.code as (typeof LEVEL2_PROVINCIAL_ROLE_CODES)[number]);
  });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/appointments')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setAppointments(data.appointments || []);
          setCandidateMembers(data.candidateMembers || []);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  if (!isPres && !isCoord) {
    return (
      <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-white dark:bg-[#0D1B30] p-8 space-y-2">
        <ShieldAlert className="h-6 w-6 text-amber-600" />
        <h2 className="font-serif-display text-xl font-bold text-[#0B1F3A] dark:text-white">
          Competência Reservada à Presidência e Coordenação Provincial
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          As nomeações de Nível 1 pertencem ao Presidente da Associação e as propostas de Nível 2 aos Coordenadores Provinciais.
        </p>
      </div>
    );
  }

  const selectedMember = candidateMembers.find((m) => String(m.id) === selectedMemberId) || null;
  const membersInProvince = candidateMembers.filter((m) => String(m.province_id) === provinceId || isPres);
  const mandatoryCentralValidation = !isPres && requiresCentralValidationForLevel2(roleCode);

  function handleSelectExistingMember(memId: string) {
    setSelectedMemberId(memId);
    const m = candidateMembers.find((item) => String(item.id) === memId);
    if (m) {
      setCandidateName(m.full_name);
      setCandidateEmail(m.email);
      setCandidatePhone(m.phone);
      if (m.photo_path) setCandidatePhotoPath(m.photo_path);
      setProvinceId(String(m.province_id));
    }
  }

  async function handleUpload(file: File, kind: 'photo' | 'attachment') {
    setErr('');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', kind === 'photo' ? 'photos' : 'appointments');
    const res = await fetch('/api/uploads', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || 'Erro ao carregar ficheiro.');
      return;
    }
    if (kind === 'photo') {
      setCandidatePhotoPath(data.filePath);
    } else {
      setAttachmentPath(data.filePath);
    }
  }

  async function handleSubmit(action: 'APPROVE' | 'REJECT') {
    setErr('');
    setMsg('');
    setActivationLink('');
    setSaving(true);
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          province_id: Number(provinceId),
          member_id: selectedMemberId ? Number(selectedMemberId) : null,
          candidate_name: candidateName,
          candidate_email: candidateEmail,
          candidate_phone: candidatePhone,
          candidate_photo_path: candidatePhotoPath || null,
          attachment_path: attachmentPath || null,
          role_code: roleCode,
          start_date: startDate,
          duration_months: Number(durationMonths),
          process_notes: processNotes,
          criteria: { idoneidade_etica: critIdoneidade, formacao_juridica: critFormacao },
          requires_central_validation: mandatoryCentralValidation || requiresCentral,
          action,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || 'Erro ao processar nomeação.');
      } else {
        if (data.status === 'AGUARDA_VALIDACAO') {
          setMsg('Proposta de Nível 2 submetida para validação superior da Direção Central.');
        } else if (action === 'APPROVE') {
          setMsg(
            `Nomeação oficializada! Despacho ${data.dispatch_number}, Termo ${data.term_of_office_number}, Código ${data.member_code}.`
          );
          if (data.activationUrl) {
            setActivationLink(data.activationUrl);
          }
        } else {
          setMsg('Proposta rejeitada e registada no histórico.');
        }
        setSelectedMemberId('');
        setCandidateName('');
        setCandidateEmail('');
        setCandidatePhotoPath('');
        setAttachmentPath('');
        setProcessNotes('');
        setReloadTick((t) => t + 1);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleValidate(id: number, decision: 'VALIDAR_NIVEL_2' | 'REJEITAR') {
    setErr('');
    setMsg('');
    setActivationLink('');
    const res = await fetch('/api/appointments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: decision }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || 'Erro ao validar proposta.');
    } else {
      if (decision === 'VALIDAR_NIVEL_2') {
        setMsg(`Proposta validada! Despacho ${data.dispatch_number} e Termo ${data.term_of_office_number} emitidos.`);
        if (data.activationUrl) setActivationLink(data.activationUrl);
      } else {
        setMsg('Proposta de nomeação rejeitada.');
      }
      setReloadTick((t) => t + 1);
    }
  }

  async function handleDismiss(id: number) {
    setErr('');
    setMsg('');
    const res = await fetch('/api/appointments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        action: 'EXONERAR',
        termination_reason: 'Exoneração administrativa com revogação imediata de sessões.',
      }),
    });
    if (res.ok) {
      setMsg('Exoneração registada, mandato encerrado e sessões administrativas revogadas.');
      setReloadTick((t) => t + 1);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-[#A6863A]">
          {isPres ? 'Nível 1 (Presidência) & Validação Central de Nível 2' : `Nível 2 · Equipa Provincial de ${user.province_name}`}
        </p>
        <h2 className="font-serif-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
          {isPres ? 'Nomeações Provinciais e Estrutura Diretiva' : 'Nomeação dos Secretários Provinciais (6 Áreas)'}
        </h2>
      </div>

      {msg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 p-4 text-xs font-medium text-emerald-800 dark:text-emerald-300 space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{msg}</span>
          </div>
          {activationLink && (
            <div className="rounded border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-[#071121] p-2.5 font-mono-tabular text-[11px] break-all">
              Link seguro de ativação (enviado por e-mail/SMS sem senha em texto simples):{' '}
              <a href={activationLink} className="font-bold text-[#A6863A] underline">
                {activationLink}
              </a>
            </div>
          )}
        </div>
      )}
      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 p-4 text-xs text-red-700 dark:text-red-300">
          {err}
        </div>
      )}

      {/* Nomination Form */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-5">
        <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white flex items-center gap-2">
          <Award className="h-4 w-4 text-[#A6863A]" />
          {isPres ? 'Instrução de Nomeação Provincial (Nível 1 ou Nível 2)' : 'Proposta de Secretário de Área Provincial (Nível 2)'}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="apProv" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
              Província *
            </label>
            <select
              id="apProv"
              disabled={isCoord && Boolean(user.province_id)}
              value={provinceId}
              onChange={(e) => setProvinceId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-sm disabled:opacity-60"
            >
              {catalog.provinces.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="apRole" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
              Cargo Provincial *
            </label>
            <select
              id="apRole"
              value={roleCode}
              onChange={(e) => setRoleCode(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-sm"
            >
              {availableRoles.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="apExistingMember" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
              Associado Existente (opcional)
            </label>
            <select
              id="apExistingMember"
              value={selectedMemberId}
              onChange={(e) => handleSelectExistingMember(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-sm"
            >
              <option value="">Novo registo / digitar manualmente...</option>
              {membersInProvince.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.member_code} · {m.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedMember && (
          <motion.div
            whileHover={{ y: -2 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="rounded-lg border border-[#A6863A]/40 bg-[#A6863A]/5 p-4 flex flex-wrap items-center gap-4 text-xs hover:border-[#A6863A] transition-colors"
          >
            <UserCheck className="h-5 w-5 text-[#A6863A] shrink-0" />
            <div>
              <p className="font-bold text-[#0B1F3A] dark:text-white">
                Histórico Associativo: {selectedMember.full_name} ({selectedMember.member_code})
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                Admissão: {selectedMember.joined_at} · Formação: {selectedMember.academic_degree || 'Não indicada'} ·{' '}
                Instituição: {selectedMember.institution || 'Não indicada'} · Cargo atual: {selectedMember.current_role_code || 'ASSOCIADO'}
              </p>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="apName" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
              Nome Completo do Candidato *
            </label>
            <input
              id="apName"
              value={candidateName}
              onChange={(e) => setCandidateName(e.target.value)}
              placeholder="Dr. / Dra. Nome Completo"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="apEmail" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
              E-mail Institucional / Pessoal *
            </label>
            <input
              id="apEmail"
              type="email"
              value={candidateEmail}
              onChange={(e) => setCandidateEmail(e.target.value)}
              placeholder="nome@ajj-angola.org"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="apPhone" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
              Telefone (Notificação SMS) *
            </label>
            <input
              id="apPhone"
              value={candidatePhone}
              onChange={(e) => setCandidatePhone(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="apStart" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
              Data de Início do Mandato
            </label>
            <input
              id="apStart"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="apDur" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
              Duração Estatutária (meses)
            </label>
            <select
              id="apDur"
              value={durationMonths}
              onChange={(e) => setDurationMonths(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-sm"
            >
              <option value="12">12 meses (1 ano)</option>
              <option value="24">24 meses (2 anos)</option>
              <option value="36">36 meses (3 anos)</option>
              <option value="48">48 meses (4 anos)</option>
            </select>
          </div>

          <div className="flex items-end gap-3">
            <label className="flex-1 flex items-center gap-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-3 py-2 text-xs cursor-pointer hover:border-[#A6863A]">
              <Upload className="h-4 w-4 text-[#A6863A] shrink-0" />
              <span className="truncate">{candidatePhotoPath ? 'Foto carregada' : 'Foto do candidato'}</span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f, 'photo');
                }}
              />
            </label>
            {candidatePhotoPath && (
              <img src={candidatePhotoPath} alt="Candidato" className="h-9 w-9 rounded object-cover border border-slate-200 shrink-0" />
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          <label className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-3.5 py-2.5 text-xs cursor-pointer hover:border-[#A6863A]">
            <FileText className="h-4 w-4 text-[#A6863A] shrink-0" />
            <span className="truncate">
              {attachmentPath ? `Documento anexado (${attachmentPath.split('/').pop()})` : 'Anexar documento / proposta de despacho (PDF/Imagem)'}
            </span>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f, 'attachment');
              }}
            />
          </label>

          <div className="flex flex-wrap gap-5 text-xs text-slate-700 dark:text-slate-300">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={critIdoneidade} onChange={(e) => setCritIdoneidade(e.target.checked)} />
              <span>Idoneidade ética verificada</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={critFormacao} onChange={(e) => setCritFormacao(e.target.checked)} />
              <span>Formação confirmada</span>
            </label>
            {!isPres && (
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-[#A6863A]">
                <input
                  type="checkbox"
                  disabled={mandatoryCentralValidation}
                  checked={mandatoryCentralValidation || requiresCentral}
                  onChange={(e) => setRequiresCentral(e.target.checked)}
                />
                <span>
                  {mandatoryCentralValidation ? 'Validação Central Obrigatória' : 'Submeter à Validação Central'}
                </span>
              </label>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="apNotes" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
            Fundamentos e Parecer Institucional
          </label>
          <textarea
            id="apNotes"
            rows={2}
            value={processNotes}
            onChange={(e) => setProcessNotes(e.target.value)}
            placeholder="Fundamentos da nomeação e competências atribuídas..."
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSubmit('APPROVE')}
            className="rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#132E54] cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            {mandatoryCentralValidation || (!isPres && requiresCentral)
              ? 'Submeter Proposta à Direção Central'
              : 'Aprovar, Emitir Despacho e Gerar Link de Ativação'}
          </button>
          {isPres && (
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSubmit('REJECT')}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer whitespace-nowrap"
            >
              Rejeitar Candidatura
            </button>
          )}
        </div>
      </div>

      {/* Appointments History */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6">
        <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white mb-4">
          Registo Oficial de Nomeações (Nível 1 & Nível 2), Mandatos e Exonerações
        </h3>

        {loading ? (
          <p className="text-xs text-slate-500">A carregar nomeações...</p>
        ) : appointments.length === 0 ? (
          <p className="text-xs text-slate-500">Nenhuma nomeação registada até ao momento.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Nível / Província</th>
                  <th className="py-2 pr-3 font-semibold">Nomeado(a)</th>
                  <th className="py-2 pr-3 font-semibold">Despacho & Termo</th>
                  <th className="py-2 pr-3 font-semibold">Mandato</th>
                  <th className="py-2 pr-3 font-semibold">Estado</th>
                  <th className="py-2 text-right font-semibold">Documentos & Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {appointments.map((ap) => (
                  <tr key={ap.id}>
                    <td className="py-3 pr-3">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        Nível {ap.level} · {ap.province_name}
                      </p>
                      <p className="text-slate-500">{ap.role_name}</p>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2.5">
                        {ap.effective_photo_path ? (
                          <img
                            src={ap.effective_photo_path}
                            alt={ap.candidate_name}
                            className="h-8 w-8 rounded-full object-cover border border-slate-200 shrink-0"
                          />
                        ) : (
                          <span className="h-8 w-8 rounded-full bg-[#0B1F3A] text-white text-[10px] font-bold inline-flex items-center justify-center shrink-0">
                            {getPersonInitials(ap.candidate_name)}
                          </span>
                        )}
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">{ap.candidate_name}</p>
                          <p className="font-mono-tabular text-slate-500">{ap.member_code || ap.candidate_email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-3 font-mono-tabular">
                      <p>{ap.dispatch_number || '-'}</p>
                      <p className="text-slate-500">{ap.term_of_office_number || '-'}</p>
                    </td>
                    <td className="py-3 pr-3 font-mono-tabular">
                      {ap.start_date ? `${ap.start_date} → ${ap.end_date}` : '-'}
                    </td>
                    <td className="py-3 pr-3">
                      <span
                        className={`font-semibold ${
                          ap.status === 'APROVADA'
                            ? 'text-emerald-600'
                            : ap.status === 'AGUARDA_VALIDACAO'
                              ? 'text-[#A6863A]'
                              : ap.status === 'EXONERADA'
                                ? 'text-amber-600'
                                : 'text-red-600'
                        }`}
                      >
                        {ap.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <div className="inline-flex flex-wrap justify-end gap-1.5">
                        {ap.attachment_path && (
                          <a
                            href={ap.attachment_path}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-[11px] font-medium hover:border-[#A6863A]"
                          >
                            <FileText className="h-3 w-3" /> Anexo
                          </a>
                        )}
                        {ap.status === 'AGUARDA_VALIDACAO' && isPres && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleValidate(ap.id, 'VALIDAR_NIVEL_2')}
                              className="inline-flex items-center gap-1 rounded bg-emerald-600 text-white px-2.5 py-1 text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                            >
                              <CheckCircle2 className="h-3 w-3" /> Validar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleValidate(ap.id, 'REJEITAR')}
                              className="inline-flex items-center gap-1 rounded border border-red-300 text-red-600 px-2 py-1 text-[11px] cursor-pointer whitespace-nowrap"
                            >
                              Rejeitar
                            </button>
                          </>
                        )}
                        {ap.dispatch_number && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                downloadAppointmentDocumentPdf('DESPACHO', {
                                  dispatch_number: ap.dispatch_number!,
                                  term_of_office_number: ap.term_of_office_number || '-',
                                  province_name: ap.province_name,
                                  candidate_name: ap.candidate_name,
                                  role_name: ap.role_name,
                                  start_date: ap.start_date || '',
                                  end_date: ap.end_date || '',
                                  duration_months: ap.duration_months,
                                  process_notes: ap.process_notes,
                                  appointed_by_name: ap.appointed_by_name || user.full_name,
                                })
                              }
                              className="inline-flex items-center gap-1 rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-[11px] font-medium hover:border-[#A6863A] cursor-pointer"
                            >
                              <FileDown className="h-3 w-3" /> Despacho
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                downloadAppointmentDocumentPdf('TERMO_POSSE', {
                                  dispatch_number: ap.dispatch_number!,
                                  term_of_office_number: ap.term_of_office_number || '-',
                                  province_name: ap.province_name,
                                  candidate_name: ap.candidate_name,
                                  role_name: ap.role_name,
                                  start_date: ap.start_date || '',
                                  end_date: ap.end_date || '',
                                  duration_months: ap.duration_months,
                                })
                              }
                              className="inline-flex items-center gap-1 rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-[11px] font-medium hover:border-[#A6863A] cursor-pointer"
                            >
                              <FileDown className="h-3 w-3" /> Termo Posse
                            </button>
                          </>
                        )}
                        {ap.status === 'APROVADA' && (isPres || (isCoord && ap.role_code !== 'COORD_PROVINCIAL')) && (
                          <button
                            type="button"
                            onClick={() => handleDismiss(ap.id)}
                            className="inline-flex items-center gap-1 rounded border border-red-300 text-red-600 px-2 py-1 text-[11px] font-medium hover:bg-red-50 cursor-pointer"
                          >
                            <UserX className="h-3 w-3" /> Exonerar
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
