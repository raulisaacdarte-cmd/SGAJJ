'use client';

import React, { useEffect, useState } from 'react';
import { Bell, CheckCheck, Mail, Send } from 'lucide-react';
import { isCentralDirectorate } from '@/lib/domain';
import type { PanelProps } from './types';

interface NotificationRow {
  id: number;
  category: string;
  title: string;
  message: string;
  channel: string;
  is_read: number;
  created_at: string;
}

interface MessageRow {
  id: number;
  sender_name: string;
  target_scope: string;
  target_province_name: string | null;
  target_department_name: string | null;
  subject: string;
  body: string;
  created_at: string;
}

interface RecipientRow {
  id: number;
  full_name: string;
  role_name: string;
  province_name: string | null;
}

export function CommunicationsModule({ user, catalog }: PanelProps) {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [recipients, setRecipients] = useState<RecipientRow[]>([]);

  const isNat = isCentralDirectorate(user.role_code);
  const [targetScope, setTargetScope] = useState(isNat ? 'TODOS_ASSOCIADOS' : 'COORDENACAO_ESPECIFICA');
  const [targetProv, setTargetProv] = useState(String(user.province_id || catalog.provinces[0]?.id || ''));
  const [targetDept, setTargetDept] = useState(String(catalog.departments[0]?.id || ''));
  const [targetUser, setTargetUser] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [channels, setChannels] = useState<string[]>(['IN_APP', 'EMAIL']);
  const [msg, setMsg] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/communications')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setNotifications(data.notifications || []);
          setMessages(data.messages || []);
          setRecipients(data.recipients || []);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  function toggleChannel(ch: string) {
    setChannels((prev) => (prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]));
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    const res = await fetch('/api/communications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_scope: targetScope,
        target_province_id: targetScope === 'COORDENACAO_ESPECIFICA' ? Number(targetProv) : null,
        target_department_id: targetScope === 'DEPARTAMENTO_ESPECIFICO' ? Number(targetDept) : null,
        target_user_id: targetScope === 'INDIVIDUAL' && targetUser ? Number(targetUser) : null,
        subject,
        body,
        channels: channels.length ? channels : ['IN_APP'],
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg(`Mensagem enviada e notificada a ${data.deliveredTo} destinatário(s).`);
      setSubject('');
      setBody('');
      setReloadTick((t) => t + 1);
    }
  }

  async function handleMarkAllRead() {
    await fetch('/api/communications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mark_all: true }),
    });
    setReloadTick((t) => t + 1);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-[#A6863A]">Comunicação Institucional</p>
        <h2 className="font-serif-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
          Mensagens, Comunicados e Notificações
        </h2>
      </div>

      {msg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-xs text-emerald-700 dark:text-emerald-300">
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Compose */}
        <form
          onSubmit={handleSend}
          className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-4"
        >
          <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white flex items-center gap-2">
            <Send className="h-4 w-4 text-[#A6863A]" /> Enviar Comunicado ou Mensagem Interna
          </h3>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Destinatários</label>
              <select
                value={targetScope}
                onChange={(e) => setTargetScope(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
              >
                {isNat && <option value="TODOS_ASSOCIADOS">Todos os Associados (Nacional)</option>}
                {isNat && <option value="DIRECAO_CENTRAL">Direção Central</option>}
                {isNat && <option value="COORDENADORES_PROVINCIAIS">Todos os Coordenadores Provinciais</option>}
                <option value="COORDENACAO_ESPECIFICA">Coordenação Provincial Específica</option>
                <option value="DEPARTAMENTO_ESPECIFICO">Departamento Específico</option>
                <option value="INDIVIDUAL">Destinatário Individual</option>
              </select>
            </div>

            {targetScope === 'COORDENACAO_ESPECIFICA' && (
              <div>
                <label className="block text-xs font-semibold mb-1">Província</label>
                <select
                  value={targetProv}
                  disabled={!isNat && Boolean(user.province_id)}
                  onChange={(e) => setTargetProv(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
                >
                  {catalog.provinces.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {targetScope === 'DEPARTAMENTO_ESPECIFICO' && (
              <div>
                <label className="block text-xs font-semibold mb-1">Departamento</label>
                <select
                  value={targetDept}
                  onChange={(e) => setTargetDept(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
                >
                  {catalog.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {targetScope === 'INDIVIDUAL' && (
              <div>
                <label className="block text-xs font-semibold mb-1">Utilizador</label>
                <select
                  value={targetUser}
                  onChange={(e) => setTargetUser(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
                >
                  <option value="">Selecionar...</option>
                  {recipients.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.full_name} — {r.role_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold mb-1">Assunto *</label>
              <input
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Mensagem *</label>
              <textarea
                required
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
              />
            </div>

            <div className="flex flex-wrap gap-4 text-xs">
              {['IN_APP', 'PUSH', 'EMAIL', 'SMS'].map((ch) => (
                <label key={ch} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={channels.includes(ch)} onChange={() => toggleChannel(ch)} />
                  <span>{ch}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-5 py-2 text-xs font-semibold text-white cursor-pointer"
          >
            Enviar Comunicado
          </button>
        </form>

        {/* Notifications Feed */}
        <div className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white flex items-center gap-2">
              <Bell className="h-4 w-4 text-[#A6863A]" /> Notificações Recebidas
            </h3>
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="inline-flex items-center gap-1 text-xs text-[#A6863A] hover:underline cursor-pointer"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Marcar lidas
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {notifications.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">Sem notificações.</p>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className={`py-3 ${n.is_read === 0 ? 'opacity-100' : 'opacity-70'}`}>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span className="font-semibold text-[#A6863A]">
                      {n.category} · {n.channel}
                    </span>
                    <span className="font-mono-tabular">{n.created_at.slice(0, 16)}</span>
                  </div>
                  <p className="text-xs font-bold text-[#0B1F3A] dark:text-white mt-0.5">{n.title}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{n.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Internal Mailbox */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-3">
        <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white flex items-center gap-2">
          <Mail className="h-4 w-4 text-[#A6863A]" /> Caixa de Mensagens Institucional ({messages.length})
        </h3>
        {messages.length === 0 ? (
          <p className="text-xs text-slate-500">Nenhuma mensagem na caixa institucional.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {messages.map((m) => (
              <div key={m.id} className="py-3 space-y-1">
                <div className="flex flex-wrap items-center justify-between text-xs text-slate-500">
                  <span>
                    De: <strong>{m.sender_name}</strong> · Âmbito: {m.target_scope}
                  </span>
                  <span className="font-mono-tabular">{m.created_at.slice(0, 16)}</span>
                </div>
                <p className="text-sm font-bold text-[#0B1F3A] dark:text-white">{m.subject}</p>
                <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-line">{m.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
