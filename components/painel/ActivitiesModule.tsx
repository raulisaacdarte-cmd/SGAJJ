'use client';

import React, { useEffect, useState } from 'react';
import { Award, Calendar, CheckCircle2, Plus, UserPlus } from 'lucide-react';
import { ACTIVITY_TYPES, hasPermission, isCentralDirectorate } from '@/lib/domain';
import { downloadCertificatePdf } from '@/lib/pdf';
import type { PanelProps } from './types';

interface ActivityRow {
  id: number;
  title: string;
  activity_type: string;
  description: string;
  organizer_name: string;
  location: string;
  start_datetime: string;
  province_name: string | null;
  approval_status: string;
  registrations_count: number;
}

interface RegistrationRow {
  id: number;
  activity_id: number;
  participant_name: string;
  participant_email: string;
  attended: number;
  certificate_code: string | null;
  activity_title: string;
  activity_type: string;
  start_datetime: string;
  location: string;
}

export function ActivitiesModule({ user, catalog }: PanelProps) {
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [title, setTitle] = useState('');
  const [actType, setActType] = useState('SEMINARIO');
  const [location, setLocation] = useState('');
  const [startDatetime, setStartDatetime] = useState(new Date().toISOString().slice(0, 16));
  const [description, setDescription] = useState('');
  const [provId, setProvId] = useState(String(user.province_id || ''));
  const [reqApproval, setReqApproval] = useState(false);
  const [msg, setMsg] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  const canManage = hasPermission(user.role_code, 'MANAGE_ACTIVITIES');
  const isNat = isCentralDirectorate(user.role_code);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/activities')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setActivities(data.activities || []);
          setRegistrations(data.registrations || []);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    const res = await fetch('/api/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        activity_type: actType,
        location,
        start_datetime: startDatetime,
        description,
        province_id: provId ? Number(provId) : null,
        requires_central_approval: reqApproval,
      }),
    });
    if (res.ok) {
      setMsg('Atividade registada no calendário institucional.');
      setTitle('');
      setLocation('');
      setDescription('');
      setReloadTick((t) => t + 1);
    }
  }

  async function handleRegister(activityId: number) {
    const res = await fetch('/api/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'REGISTER',
        activity_id: activityId,
        participant_name: user.full_name,
        participant_email: user.email,
        participant_phone: user.phone,
      }),
    });
    if (res.ok) {
      setMsg('Inscrição confirmada nesta atividade.');
      setReloadTick((t) => t + 1);
    }
  }

  async function handleIssueCert(registrationId: number) {
    const res = await fetch('/api/activities', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ISSUE_CERTIFICATE', registration_id: registrationId }),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg(`Presença confirmada e Certificado QR emitido: ${data.certificate_code}`);
      setReloadTick((t) => t + 1);
    }
  }

  async function handleApproveActivity(id: number) {
    await fetch('/api/activities', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'APPROVE_ACTIVITY', id, approval_status: 'APROVADA' }),
    });
    setReloadTick((t) => t + 1);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-[#A6863A]">Agenda, Formação e Certificação</p>
        <h2 className="font-serif-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
          Atividades e Formações Jurídicas
        </h2>
      </div>

      {msg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-xs text-emerald-700 dark:text-emerald-300">
          {msg}
        </div>
      )}

      {canManage && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-4"
        >
          <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white flex items-center gap-2">
            <Plus className="h-4 w-4 text-[#A6863A]" /> Organizar Nova Atividade ou Formação
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold mb-1">Nome da Atividade *</label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Workshop de Direito Constitucional Angolano"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Tipologia</label>
              <select
                value={actType}
                onChange={(e) => setActType(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
              >
                {ACTIVITY_TYPES.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Data e Hora *</label>
              <input
                type="datetime-local"
                required
                value={startDatetime}
                onChange={(e) => setStartDatetime(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold mb-1">Local ou Plataforma *</label>
              <input
                required
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ex.: Auditório da Faculdade / Google Meet"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
              />
            </div>
            {isNat && (
              <div>
                <label className="block text-xs font-semibold mb-1">Província</label>
                <select
                  value={provId}
                  onChange={(e) => setProvId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
                >
                  <option value="">Nacional</option>
                  {catalog.provinces.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="sm:col-span-4">
              <label className="block text-xs font-semibold mb-1">Descrição</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
              />
            </div>
          </div>

          {!isNat && (
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={reqApproval} onChange={(e) => setReqApproval(e.target.checked)} />
              <span>Solicitar autorização superior da Direção Central para esta atividade</span>
            </label>
          )}

          <button
            type="submit"
            className="rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-5 py-2 text-xs font-semibold text-white cursor-pointer"
          >
            Criar Atividade
          </button>
        </form>
      )}

      {/* Activities List */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-4">
        <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white flex items-center gap-2">
          <Calendar className="h-4 w-4 text-[#A6863A]" /> Calendário de Atividades ({activities.length})
        </h3>

        {activities.length === 0 ? (
          <p className="text-xs text-slate-500">Nenhuma atividade registada.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {activities.map((a) => (
              <div key={a.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-[#A6863A]">{a.activity_type}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">{a.start_datetime.replace('T', ' ').slice(0, 16)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{a.province_name || 'Nacional'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{a.approval_status}</span>
                  </div>
                  <p className="text-sm font-bold text-[#0B1F3A] dark:text-white">{a.title}</p>
                  <p className="text-xs text-slate-500">{a.location} · {a.registrations_count} inscrito(s)</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleRegister(a.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium cursor-pointer hover:border-[#A6863A]"
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Inscrever-me
                  </button>
                  {isNat && a.approval_status === 'PENDENTE_DIRECAO' && (
                    <button
                      type="button"
                      onClick={() => handleApproveActivity(a.id)}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
                    >
                      Autorizar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Registrations & QR Certificates */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-4">
        <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white flex items-center gap-2">
          <Award className="h-4 w-4 text-[#A6863A]" /> Inscrições, Presenças e Certificados QR ({registrations.length})
        </h3>
        {registrations.length === 0 ? (
          <p className="text-xs text-slate-500">Nenhuma inscrição encontrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th className="py-2 pr-3">Participante</th>
                  <th className="py-2 pr-3">Atividade</th>
                  <th className="py-2 pr-3">Certificado</th>
                  <th className="py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {registrations.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2.5 pr-3">
                      <p className="font-semibold text-slate-900 dark:text-white">{r.participant_name}</p>
                      <p className="text-slate-500">{r.participant_email}</p>
                    </td>
                    <td className="py-2.5 pr-3">
                      <p>{r.activity_title}</p>
                      <p className="font-mono-tabular text-slate-500">{r.start_datetime.slice(0, 10)}</p>
                    </td>
                    <td className="py-2.5 pr-3 font-mono-tabular">
                      {r.certificate_code ? (
                        <span className="text-emerald-600 font-semibold">{r.certificate_code}</span>
                      ) : (
                        <span className="text-slate-400">Não emitido</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      {r.certificate_code ? (
                        <button
                          type="button"
                          onClick={() =>
                            downloadCertificatePdf({
                              participant_name: r.participant_name,
                              activity_title: r.activity_title,
                              activity_type: r.activity_type,
                              start_datetime: r.start_datetime,
                              location: r.location,
                              certificate_code: r.certificate_code!,
                              verifyUrl: `${window.location.origin}/verificar/${r.certificate_code}`,
                            })
                          }
                          className="rounded bg-[#0B1F3A] dark:bg-[#A6863A] px-2.5 py-1 text-[11px] font-semibold text-white cursor-pointer"
                        >
                          Descarregar PDF
                        </button>
                      ) : canManage ? (
                        <button
                          type="button"
                          onClick={() => handleIssueCert(r.id)}
                          className="inline-flex items-center gap-1 rounded border border-[#A6863A] text-[#A6863A] px-2.5 py-1 text-[11px] font-semibold cursor-pointer"
                        >
                          <CheckCircle2 className="h-3 w-3" /> Confirmar Presença & Emitir
                        </button>
                      ) : null}
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
