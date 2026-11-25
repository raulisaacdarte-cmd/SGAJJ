'use client';

import React, { useEffect, useState } from 'react';
import { Camera, Check, Copy, Database, ExternalLink, History, KeyRound, Settings, Shield, UserPlus } from 'lucide-react';
import { getPersonInitials } from '@/lib/domain';
import type { PanelProps } from './types';

interface UserRow {
  id: number;
  email: string;
  phone: string;
  full_name: string;
  role_code: string;
  role_name: string;
  province_name: string | null;
  photo_path: string | null;
  member_code: string | null;
  mfa_enabled: number;
  is_active: number;
  activation_pending: number;
  active_sessions_count: number;
  last_login_at: string | null;
}

interface AuditRow {
  id: number;
  user_name: string;
  role_code: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details_json: string;
  previous_state_json?: string | null;
  new_state_json?: string | null;
  supporting_doc_path?: string | null;
  created_at: string;
}

export function AdminModule({ user, catalog }: PanelProps) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([]);

  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('+244 ');
  const [newPassword, setNewPassword] = useState('');
  const [sendActivationLink, setSendActivationLink] = useState(true);
  const [newRole, setNewRole] = useState('SECRETARIO_NACIONAL');
  const [newProv, setNewProv] = useState('');
  const [newDept, setNewDept] = useState('');
  const [newPhotoPath, setNewPhotoPath] = useState('');
  const [newMfa, setNewMfa] = useState(false);

  const [orgName, setOrgName] = useState(catalog.settings.organization_name);
  const [nif, setNif] = useState(catalog.settings.nif || '');
  const [hq, setHq] = useState(catalog.settings.headquarters_address || '');
  const [quotaRules, setQuotaRules] = useState(catalog.categories);

  const [auditFilter, setAuditFilter] = useState('');
  const [activationUrlBanner, setActivationUrlBanner] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setUsers(data.users || []);
          setAuditLogs(data.auditLogs || []);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  if (user.role_code !== 'PRESIDENTE') {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-8 space-y-2">
        <Shield className="h-6 w-6 text-[#A6863A]" />
        <h2 className="font-serif-display text-xl font-bold text-[#0B1F3A] dark:text-white">
          Administração Reservada ao Presidente
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          O controlo administrativo total, gestão de permissões, backups e configuração geral pertencem exclusivamente ao Presidente da Associação.
        </p>
      </div>
    );
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', 'photos');
    const res = await fetch('/api/uploads', { method: 'POST', body: fd });
    const data = await res.json();
    if (res.ok) {
      setNewPhotoPath(data.filePath);
    } else {
      setErr(data.error || 'Erro ao carregar fotografia.');
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setMsg('');
    setActivationUrlBanner('');
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'CREATE_USER',
        full_name: newName,
        email: newEmail,
        phone: newPhone,
        password: sendActivationLink ? undefined : newPassword,
        send_activation_link: sendActivationLink,
        role_code: newRole,
        province_id: newProv ? Number(newProv) : null,
        department_id: newDept ? Number(newDept) : null,
        photo_path: newPhotoPath || null,
        mfa_enabled: newMfa,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || 'Erro ao criar utilizador.');
    } else {
      setMsg('Conta institucional e permissões criadas com sucesso.');
      if (data.activationUrl) {
        setActivationUrlBanner(data.activationUrl);
      }
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setNewPhotoPath('');
      setReloadTick((t) => t + 1);
    }
  }

  async function handleToggleUser(u: UserRow, overrides?: { role_code?: string; is_active?: boolean; mfa_enabled?: boolean }) {
    setErr('');
    setMsg('');
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'TOGGLE_USER',
        target_user_id: u.id,
        is_active: overrides?.is_active !== undefined ? overrides.is_active : undefined,
        role_code: overrides?.role_code,
        mfa_enabled: overrides?.mfa_enabled,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || 'Erro ao atualizar conta.');
    } else {
      setMsg(`Permissões e estado de ${u.full_name} atualizados.`);
      setReloadTick((t) => t + 1);
    }
  }

  async function handleRevokeCredentials(u: UserRow) {
    setErr('');
    setMsg('');
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'REVOKE_CREDENTIALS',
        target_user_id: u.id,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || 'Erro ao revogar credenciais.');
    } else {
      setMsg(`Sessões anteriores de ${u.full_name} terminadas e novo link de ativação emitido.`);
      setReloadTick((t) => t + 1);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'UPDATE_SETTINGS',
        organization_name: orgName,
        nif,
        headquarters_address: hq,
        quota_rules: quotaRules,
      }),
    });
    if (res.ok) {
      setMsg('Configurações gerais e regras de quotas atualizadas.');
    }
  }

  const filteredLogs = auditLogs.filter((l) => {
    if (!auditFilter.trim()) return true;
    const q = auditFilter.toLowerCase();
    return (
      l.action.toLowerCase().includes(q) ||
      l.user_name.toLowerCase().includes(q) ||
      l.entity_type.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#A6863A]">Presidência · Controlo Total</p>
          <h2 className="font-serif-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
            Administração, Permissões, Auditoria e Backups
          </h2>
        </div>

        <a
          href="/api/admin/backup"
          className="inline-flex items-center gap-2 rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-4 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0"
        >
          <Database className="h-4 w-4" /> Descarregar Backup SQL (.db)
        </a>
      </div>

      {msg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-xs text-emerald-700 dark:text-emerald-300">
          {msg}
        </div>
      )}
      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-300">
          {err}
        </div>
      )}

      {activationUrlBanner && (
        <div className="rounded-xl border border-[#A6863A]/50 bg-[#A6863A]/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#0B1F3A] dark:text-white">
              Link Seguro de Ativação Individual Gerado (48 horas · Uso Único)
            </p>
            <p className="font-mono-tabular text-[11px] text-slate-700 dark:text-slate-200 break-all mt-1">
              {activationUrlBanner}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(activationUrlBanner);
                setCopiedLink(true);
                setTimeout(() => setCopiedLink(false), 2000);
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-[#0B1F3A] px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
            >
              {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedLink ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        </div>
      )}

      {/* Create User with Statutory Role */}
      <form
        onSubmit={handleCreateUser}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-4"
      >
        <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-[#A6863A]" /> Criar Utilizador da Direção Central ou Província
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold mb-1">Nome Completo *</label>
            <input
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">E-mail *</label>
            <input
              required
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Cargo Estatutário *</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
            >
              {catalog.roles.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name} ({r.scope})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Telefone</label>
            <input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Província (se Provincial)</label>
            <select
              value={newProv}
              onChange={(e) => setNewProv(e.target.value)}
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
            <label className="block text-xs font-semibold mb-1">Departamento</label>
            <select
              value={newDept}
              onChange={(e) => setNewDept(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
            >
              <option value="">Sem departamento específico</option>
              {catalog.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Fotografia do Titular</label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs cursor-pointer">
              <Camera className="h-3.5 w-3.5 text-[#A6863A]" />
              <span className="truncate">{newPhotoPath ? 'Foto carregada' : 'Carregar foto'}</span>
              <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
            </label>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Método de Acesso</label>
            <label className="flex items-center gap-2 text-xs cursor-pointer pt-1.5">
              <input
                type="checkbox"
                checked={sendActivationLink}
                onChange={(e) => setSendActivationLink(e.target.checked)}
              />
              <span>Gerar link de ativação seguro</span>
            </label>
          </div>
          {!sendActivationLink && (
            <div>
              <label className="block text-xs font-semibold mb-1">Palavra-Passe Inicial *</label>
              <input
                required
                type="password"
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
              />
            </div>
          )}
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={newMfa} onChange={(e) => setNewMfa(e.target.checked)} />
              <span>Exigir MFA no login</span>
            </label>
          </div>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-5 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer"
        >
          Criar Conta Institucional
        </button>
      </form>

      {/* Users Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6">
        <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white mb-4">Utilizadores, Permissões e Sessões ({users.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <th className="py-2 pr-3">Titular / E-mail</th>
                <th className="py-2 pr-3">Cargo Estatutário</th>
                <th className="py-2 pr-3">Província</th>
                <th className="py-2 pr-3">Sessões / Ativação</th>
                <th className="py-2 text-right">Ações de Segurança</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2.5">
                      {u.photo_path ? (
                        <img src={u.photo_path} alt={u.full_name} className="h-8 w-8 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="h-8 w-8 rounded-lg bg-[#0B1F3A]/10 dark:bg-slate-800 text-[#0B1F3A] dark:text-[#C5A24D] flex items-center justify-center font-serif-display text-[11px] font-bold shrink-0">
                          {getPersonInitials(u.full_name)}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{u.full_name}</p>
                        <p className="text-slate-500">
                          {u.email}
                          {u.member_code ? ` · ${u.member_code}` : ''}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 pr-3">
                    {u.role_code === 'PRESIDENTE' ? (
                      <span className="font-semibold">{u.role_name}</span>
                    ) : (
                      <select
                        aria-label={`Alterar cargo de ${u.full_name}`}
                        value={u.role_code}
                        onChange={(e) => handleToggleUser(u, { role_code: e.target.value })}
                        className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-2 py-1 text-[11px]"
                      >
                        {catalog.roles.map((r) => (
                          <option key={r.code} value={r.code}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">{u.province_name || 'Nacional'}</td>
                  <td className="py-2.5 pr-3 font-mono-tabular">
                    <span>{u.active_sessions_count} ativas</span>
                    {u.activation_pending ? (
                      <span className="block text-[11px] text-amber-600 font-sans font-semibold">Ativação pendente</span>
                    ) : (
                      <span className="block text-[11px] text-slate-500 font-sans">
                        MFA: {u.mfa_enabled ? 'Ativo' : 'Opcional'}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 text-right">
                    {u.role_code !== 'PRESIDENTE' && (
                      <div className="inline-flex flex-wrap justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleRevokeCredentials(u)}
                          title="Terminar sessões ativas e exigir nova ativação"
                          className="inline-flex items-center gap-1 rounded border border-amber-300 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400 cursor-pointer"
                        >
                          <KeyRound className="h-3 w-3" /> Revogar Sessões
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleUser(u, { is_active: u.is_active === 0 })}
                          className={`rounded border px-2 py-1 text-[11px] font-semibold cursor-pointer ${
                            u.is_active ? 'border-emerald-300 text-emerald-700' : 'border-red-300 text-red-700'
                          }`}
                        >
                          {u.is_active ? 'Ativo (Desativar)' : 'Inativo (Ativar)'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Institutional Settings & Quota Rules */}
      <form
        onSubmit={handleSaveSettings}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-4"
      >
        <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white flex items-center gap-2">
          <Settings className="h-4 w-4 text-[#A6863A]" /> Configurações Institucionais e Tabela de Quotas
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold mb-1">Nome da Organização</label>
            <input
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">NIF</label>
            <input
              value={nif}
              onChange={(e) => setNif(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Sede Nacional</label>
            <input
              value={hq}
              onChange={(e) => setHq(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          {quotaRules.map((cat, idx) => (
            <div key={cat.id} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-1">
              <p className="text-xs font-semibold">{cat.name}</p>
              <label className="block text-[11px] text-slate-500">Quota Mensal (AOA)</label>
              <input
                type="number"
                value={cat.monthly_quota_aoa}
                onChange={(e) => {
                  const next = [...quotaRules];
                  next[idx] = { ...next[idx], monthly_quota_aoa: Number(e.target.value) };
                  setQuotaRules(next);
                }}
                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-2 py-1 text-xs font-mono-tabular"
              />
            </div>
          ))}
        </div>

        <button
          type="submit"
          className="rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-5 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer"
        >
          Guardar Configurações
        </button>
      </form>

      {/* Immutable Audit Log with Diff View */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white flex items-center gap-2">
            <History className="h-4 w-4 text-[#A6863A]" /> Registo de Atividades e Auditoria ({filteredLogs.length})
          </h3>
          <input
            placeholder="Filtrar ação, utilizador ou entidade..."
            value={auditFilter}
            onChange={(e) => setAuditFilter(e.target.value)}
            className="w-full sm:w-64 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-1.5 text-xs"
          />
        </div>
        <div className="max-h-96 overflow-y-auto overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <th className="py-2 pr-3">Data/Hora</th>
                <th className="py-2 pr-3">Utilizador / Cargo</th>
                <th className="py-2 pr-3">Ação</th>
                <th className="py-2 pr-3">Entidade</th>
                <th className="py-2">Alteração (Antes → Depois)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="align-top">
                  <td className="py-2 pr-3 font-mono-tabular text-slate-500 whitespace-nowrap">{log.created_at}</td>
                  <td className="py-2 pr-3">
                    {log.user_name} <span className="text-slate-500">({log.role_code})</span>
                  </td>
                  <td className="py-2 pr-3 font-mono-tabular font-semibold text-[#0B1F3A] dark:text-[#C5A24D]">
                    {log.action}
                  </td>
                  <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">
                    {log.entity_type} {log.entity_id ? `#${log.entity_id}` : ''}
                    {log.supporting_doc_path && (
                      <a
                        href={log.supporting_doc_path}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-[11px] text-[#A6863A] hover:underline inline-flex items-center gap-0.5 mt-0.5"
                      >
                        Anexo <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </td>
                  <td className="py-2 text-[11px] font-mono-tabular text-slate-600 dark:text-slate-300 max-w-xs break-words">
                    {log.previous_state_json && log.previous_state_json !== '{}' ? (
                      <span>
                        <span className="text-red-600 dark:text-red-400">{log.previous_state_json}</span>
                        {' → '}
                      </span>
                    ) : null}
                    {log.new_state_json && log.new_state_json !== '{}' ? (
                      <span className="text-emerald-700 dark:text-emerald-400">{log.new_state_json}</span>
                    ) : (
                      <span className="text-slate-400">{log.details_json}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
