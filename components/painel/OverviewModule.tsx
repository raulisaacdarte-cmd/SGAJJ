'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Award,
  BookOpen,
  Building2,
  Calendar,
  FileText,
  Gavel,
  Mail,
  MessageSquare,
  Phone,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { formatAoa, getPersonInitials, isCentralDirectorate, isPresident, isProvincialRole } from '@/lib/domain';
import { MemberPortalModule } from './MemberPortalModule';
import type { PanelProps } from './types';

interface DirectorateMemberRow {
  role_code: string;
  role_name: string;
  rank: number;
  user_id: number | null;
  full_name: string | null;
  email: string | null;
  photo_path: string | null;
  is_active: number | null;
  member_code: string | null;
}

interface ProvincialTeamRow {
  role_code: string;
  role_name: string;
  rank: number;
  user_id: number | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  photo_path: string | null;
  member_code: string | null;
  is_active: number | null;
}

interface AdminOverview {
  kpis: {
    totalMembers: number;
    activeMembers: number;
    suspendedMembers: number;
    pendingApplications: number;
    activeCoordinations: number;
    totalRevenue: number;
    totalExpenses: number;
    pendingExpenses: number;
    activitiesCount: number;
    appointmentsCount: number;
    pendingValidations: number;
    pendingReports: number;
  };
  growthByProvince: Array<{
    name: string;
    code: string;
    members_count: number;
    coordination_status: string;
  }>;
  directorateRoster?: DirectorateMemberRow[];
  provincialDashboard?: {
    coordination: {
      province_name: string;
      province_code: string;
      status: string;
      coordinator_name: string | null;
      coordinator_email: string | null;
      coordinator_phone: string | null;
      coordinator_photo: string | null;
      coordinator_member_code: string | null;
      activated_at: string | null;
    } | null;
    team: ProvincialTeamRow[];
    documentsCount: number;
    communiquesCount: number;
  } | null;
}

export function OverviewModule({ user, catalog, onNavigateTab }: PanelProps) {
  const isMemberOnly = user.role_code === 'ASSOCIADO';
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(!isMemberOnly);

  useEffect(() => {
    if (isMemberOnly) return;
    fetch('/api/admin')
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [isMemberOnly]);

  if (isMemberOnly) {
    return <MemberPortalModule user={user} catalog={catalog} onNavigateTab={onNavigateTab} />;
  }

  if (loading || !data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-28 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] animate-pulse"
          />
        ))}
      </div>
    );
  }

  const isNat = isCentralDirectorate(user.role_code);
  const isPres = isPresident(user.role_code);
  const isProv = isProvincialRole(user.role_code);
  const { kpis, growthByProvince } = data;

  const nationalRoleFocus: Array<{ label: string; desc: string; tab: string; icon: React.ComponentType<{ className?: string }> }> =
    user.role_code === 'PRESIDENTE'
      ? [
          {
            label: `Validar Nomeações (${kpis.pendingValidations})`,
            desc: 'Propostas de Nível 1 e validações centrais pendentes',
            tab: 'nomeacoes',
            icon: Award,
          },
          {
            label: `Aprovar Despesas (${kpis.pendingExpenses})`,
            desc: 'Autorizar operações financeiras pendentes',
            tab: 'financeiro',
            icon: Wallet,
          },
          {
            label: 'Administração & Auditoria',
            desc: 'Gerir contas, permissões, sessões e backups',
            tab: 'administracao',
            icon: ShieldCheck,
          },
          {
            label: `Candidaturas (${kpis.pendingApplications})`,
            desc: 'Aprovar novos associados e coordenações',
            tab: 'associados',
            icon: Users,
          },
        ]
      : user.role_code === 'SECRETARIO_NACIONAL'
        ? [
            { label: 'Atas e Correspondências', desc: 'Registo e organização documental nacional', tab: 'documentos', icon: FileText },
            { label: 'Convocatórias e Reuniões', desc: 'Gestão de reuniões da Direção Central', tab: 'atividades', icon: Calendar },
            { label: 'Candidaturas e Associados', desc: 'Preparação de processos e acompanhamento', tab: 'associados', icon: Users },
            { label: 'Comunicações Nacionais', desc: 'Expediente e acompanhamento provincial', tab: 'comunicacoes', icon: MessageSquare },
          ]
        : user.role_code === 'DIR_NAC_JURIDICO'
          ? [
              { label: 'Pareceres e Estudos Jurídicos', desc: 'Módulo jurídico nacional e jurisprudência', tab: 'juridico_etica', icon: Gavel },
              { label: 'Formações Jurídicas', desc: 'Seminários, conferências e capacitação', tab: 'atividades', icon: Calendar },
              { label: 'Arquivo Jurídico', desc: 'Legislação e documentos técnicos', tab: 'documentos', icon: FileText },
              { label: 'A Voz Jurídica', desc: 'Artigos e análises jurídicas públicas', tab: 'editorial', icon: BookOpen },
            ]
          : user.role_code === 'DIR_NAC_PLANEAMENTO'
            ? [
                { label: 'Planeamento e Atividades', desc: 'Calendário nacional e planos anuais', tab: 'atividades', icon: Calendar },
                { label: 'Planos e Relatórios', desc: 'Receção de planos e relatórios provinciais', tab: 'documentos', icon: FileText },
                { label: 'Comunicação com Províncias', desc: 'Coordenação logística das equipas', tab: 'comunicacoes', icon: MessageSquare },
                { label: 'Base Associativa', desc: 'Distribuição territorial de quadros', tab: 'associados', icon: Users },
              ]
            : user.role_code === 'DIR_NAC_COMUNICACAO'
              ? [
                  { label: 'A Voz Jurídica (CMS)', desc: 'Aprovar e publicar artigos e campanhas', tab: 'editorial', icon: BookOpen },
                  { label: 'Comunicados Oficiais', desc: 'Envio de notificações e comunicados', tab: 'comunicacoes', icon: MessageSquare },
                  { label: 'Identidade Documental', desc: 'Ativos e documentos institucionais', tab: 'documentos', icon: FileText },
                  { label: 'Cobertura de Eventos', desc: 'Agenda pública de eventos jurídicos', tab: 'atividades', icon: Calendar },
                ]
              : user.role_code === 'DIR_NAC_FISCALIZACAO'
                ? [
                    { label: 'Processos de Ética e Disciplina', desc: 'Controlo ético e pareceres disciplinares', tab: 'juridico_etica', icon: Gavel },
                    { label: 'Relatórios de Auditoria', desc: 'Fiscalização documental e estatutária', tab: 'documentos', icon: FileText },
                    { label: 'Consulta de Associados', desc: 'Verificação de regularidade associativa', tab: 'associados', icon: Users },
                    { label: 'Alertas Institucionais', desc: 'Comunicações com órgãos provinciais', tab: 'comunicacoes', icon: MessageSquare },
                  ]
                : [
                    { label: 'Tesouraria Nacional e Quotas', desc: 'Receitas, despesas e inadimplência', tab: 'financeiro', icon: Wallet },
                    { label: 'Documentos Financeiros', desc: 'Balancetes, recibos e relatórios', tab: 'documentos', icon: FileText },
                    { label: 'Quadro Associativo', desc: 'Situação contributiva dos associados', tab: 'associados', icon: Users },
                    { label: 'Avisos Financeiros', desc: 'Comunicação com tesourarias provinciais', tab: 'comunicacoes', icon: MessageSquare },
                  ];

  // Provincial Coordination Dashboard
  if (isProv && data.provincialDashboard) {
    const provDash = data.provincialDashboard;
    const coord = provDash.coordination;
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#A6863A]">
              Painel da Coordenação Provincial · {coord?.province_name || user.province_name}
            </p>
            <h2 className="font-serif-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
              Estado da Coordenação: {coord?.status || 'ATIVA'}
            </h2>
          </div>
          {user.role_code === 'COORD_PROVINCIAL' && (
            <button
              type="button"
              onClick={() => onNavigateTab('nomeacoes')}
              className="rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-4 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer"
            >
              Nomear Equipa Provincial (Nível 2)
            </button>
          )}
        </div>

        {/* Provincial Coordinator Highlight */}
        {coord && (
          <motion.div
            whileHover={{ y: -2 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-[#A6863A]/60 hover:shadow-sm transition-colors"
          >
            <div className="flex items-center gap-4 min-w-0">
              {coord.coordinator_photo ? (
                <img
                  src={coord.coordinator_photo}
                  alt={coord.coordinator_name || 'Coordenador'}
                  className="h-14 w-14 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                />
              ) : (
                <div className="h-14 w-14 rounded-xl bg-[#0B1F3A] text-white flex items-center justify-center font-serif-display text-lg font-bold shrink-0">
                  {getPersonInitials(coord.coordinator_name || 'AJJ')}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#A6863A]">Coordenador Provincial</p>
                <p className="text-base font-bold text-[#0B1F3A] dark:text-white truncate">
                  {coord.coordinator_name || 'Cargo vago'}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-0.5">
                  {coord.coordinator_member_code && (
                    <span className="font-mono-tabular font-semibold text-[#0B1F3A] dark:text-[#C5A24D]">
                      {coord.coordinator_member_code}
                    </span>
                  )}
                  {coord.coordinator_email && (
                    <span className="inline-flex items-center gap-1">
                      <Mail className="h-3 w-3" /> {coord.coordinator_email}
                    </span>
                  )}
                  {coord.coordinator_phone && (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {coord.coordinator_phone}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onNavigateTab('associados')}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold whitespace-nowrap cursor-pointer"
              >
                Associados ({kpis.totalMembers})
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('comunicacoes')}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold whitespace-nowrap cursor-pointer"
              >
                Comunicados ({provDash.communiquesCount})
              </button>
            </div>
          </motion.div>
        )}

        {/* Province-scoped KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Associados na Província</span>
              <Users className="h-4 w-4 text-[#A6863A]" />
            </div>
            <p className="mt-2 font-mono-tabular text-2xl font-bold text-[#0B1F3A] dark:text-white">{kpis.totalMembers}</p>
            <p className="mt-1 text-xs text-slate-500 font-mono-tabular">
              {kpis.activeMembers} ativos · {kpis.suspendedMembers} suspensos
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Candidaturas Pendentes</span>
              <UserCheck className="h-4 w-4 text-[#A6863A]" />
            </div>
            <p className="mt-2 font-mono-tabular text-2xl font-bold text-[#0B1F3A] dark:text-white">{kpis.pendingApplications}</p>
            <p className="mt-1 text-xs text-slate-500 font-mono-tabular">
              {kpis.pendingValidations} nomeações em validação central
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Finanças Provinciais</span>
              <TrendingUp className="h-4 w-4 text-[#A6863A]" />
            </div>
            <p className="mt-2 font-mono-tabular text-xl font-bold text-[#0B1F3A] dark:text-white">
              {formatAoa(kpis.totalRevenue)}
            </p>
            <p className="mt-1 text-xs text-slate-500 font-mono-tabular">Despesas: {formatAoa(kpis.totalExpenses)}</p>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Atividades & Documentos</span>
              <Calendar className="h-4 w-4 text-[#A6863A]" />
            </div>
            <p className="mt-2 font-mono-tabular text-2xl font-bold text-[#0B1F3A] dark:text-white">{kpis.activitiesCount}</p>
            <p className="mt-1 text-xs text-slate-500 font-mono-tabular">
              {provDash.documentsCount} documentos · {kpis.pendingReports} relatórios pendentes
            </p>
          </div>
        </div>

        {/* 7-Seat Provincial Coordination Team Roster */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white">
              Equipa da Coordenação Provincial (7 Cargos Estatutários)
            </h3>
            {user.role_code === 'COORD_PROVINCIAL' && (
              <button
                type="button"
                onClick={() => onNavigateTab('nomeacoes')}
                className="text-xs font-semibold text-[#A6863A] hover:underline cursor-pointer"
              >
                Gerir nomeações de Nível 2
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {provDash.team.map((member) => (
              <motion.div
                key={member.role_code}
                whileHover={{ y: -3, scale: 1.01 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="rounded-lg border border-slate-200 dark:border-slate-800 p-3.5 flex items-center gap-3 hover:border-[#A6863A]/60 hover:shadow-sm transition-colors"
              >
                {member.photo_path ? (
                  <img
                    src={member.photo_path}
                    alt={member.full_name || member.role_name}
                    className="h-11 w-11 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                  />
                ) : (
                  <div className="h-11 w-11 rounded-lg bg-[#0B1F3A]/10 dark:bg-slate-800 text-[#0B1F3A] dark:text-[#C5A24D] flex items-center justify-center font-serif-display text-xs font-bold shrink-0">
                    {member.full_name ? getPersonInitials(member.full_name) : 'VG'}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-[#A6863A] truncate">{member.role_name}</p>
                  <p className="text-xs font-bold text-[#0B1F3A] dark:text-white truncate">
                    {member.full_name || 'Cargo vago'}
                  </p>
                  <p className="text-[11px] text-slate-500 font-mono-tabular truncate">
                    {member.member_code || member.email || 'Aguardando nomeação'}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#A6863A]">
            {isNat ? `Direção Central · ${user.role_name}` : `Coordenação Provincial · ${user.province_name}`}
          </p>
          <h2 className="font-serif-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
            Indicadores Institucionais em Tempo Real
          </h2>
        </div>
        {isPres && (
          <button
            type="button"
            onClick={() => onNavigateTab('nomeacoes')}
            className="rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-4 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            Nomeações & Validações ({kpis.pendingValidations})
          </button>
        )}
      </div>

      {/* Role-Specific Priority Modules for National Directorate */}
      {isNat && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {nationalRoleFocus.map((item) => {
            const Icon = item.icon;
            return (
              <motion.button
                key={item.label}
                type="button"
                whileHover={{ y: -3, scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                onClick={() => onNavigateTab(item.tab)}
                className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-4 hover:border-[#A6863A] hover:shadow-sm transition-colors cursor-pointer"
              >
                <Icon className="h-4 w-4 text-[#A6863A] mb-2" />
                <p className="text-xs font-bold text-[#0B1F3A] dark:text-white">{item.label}</p>
                <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{item.desc}</p>
              </motion.button>
            );
          })}
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{isNat ? 'Total Nacional de Associados' : 'Associados na Província'}</span>
            <Users className="h-4 w-4 text-[#A6863A]" />
          </div>
          <p className="mt-2 font-mono-tabular text-2xl font-bold text-[#0B1F3A] dark:text-white">{kpis.totalMembers}</p>
          <p className="mt-1 text-xs text-slate-500 font-mono-tabular">
            {kpis.activeMembers} {kpis.activeMembers === 1 ? 'ativo' : 'ativos'} · {kpis.suspendedMembers}{' '}
            {kpis.suspendedMembers === 1 ? 'suspenso' : 'suspensos'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{isNat ? 'Coordenações Ativas' : 'Candidaturas Pendentes'}</span>
            <Building2 className="h-4 w-4 text-[#A6863A]" />
          </div>
          <p className="mt-2 font-mono-tabular text-2xl font-bold text-[#0B1F3A] dark:text-white">
            {isNat ? `${kpis.activeCoordinations} / ${growthByProvince.length}` : kpis.pendingApplications}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-mono-tabular">
            {isNat
              ? `${kpis.pendingApplications} ${kpis.pendingApplications === 1 ? 'candidatura' : 'candidaturas'} · ${kpis.pendingValidations} p/ validação`
              : `${kpis.appointmentsCount} ${kpis.appointmentsCount === 1 ? 'nomeação' : 'nomeações'}`}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Receitas vs Despesas</span>
            <TrendingUp className="h-4 w-4 text-[#A6863A]" />
          </div>
          <p className="mt-2 font-mono-tabular text-xl font-bold text-[#0B1F3A] dark:text-white">
            {formatAoa(kpis.totalRevenue)}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-mono-tabular">
            Despesas: {formatAoa(kpis.totalExpenses)} · {kpis.pendingExpenses} p/ aprovação
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Atividades e Relatórios</span>
            <Calendar className="h-4 w-4 text-[#A6863A]" />
          </div>
          <p className="mt-2 font-mono-tabular text-2xl font-bold text-[#0B1F3A] dark:text-white">{kpis.activitiesCount}</p>
          <p className="mt-1 text-xs text-slate-500 font-mono-tabular">
            {kpis.pendingReports} {kpis.pendingReports === 1 ? 'relatório pendente' : 'relatórios pendentes'}
          </p>
        </div>
      </div>

      {/* Central Directorate 7-Seat Roster */}
      {isNat && data.directorateRoster && data.directorateRoster.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white">
              Estrutura Administrativa da Direção Central (7 Cargos Nacionais)
            </h3>
            {isPres && (
              <button
                type="button"
                onClick={() => onNavigateTab('administracao')}
                className="text-xs font-semibold text-[#A6863A] hover:underline cursor-pointer"
              >
                Gerir titulares e contas
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {data.directorateRoster.map((seat) => (
              <motion.div
                key={seat.role_code}
                whileHover={{ y: -3, scale: 1.01 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 flex items-center gap-3 hover:border-[#A6863A]/60 hover:shadow-sm transition-colors"
              >
                {seat.photo_path ? (
                  <img
                    src={seat.photo_path}
                    alt={seat.full_name || seat.role_name}
                    className="h-10 w-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-lg bg-[#0B1F3A]/10 dark:bg-slate-800 text-[#0B1F3A] dark:text-[#C5A24D] flex items-center justify-center font-serif-display text-xs font-bold shrink-0">
                    {seat.full_name ? getPersonInitials(seat.full_name) : 'DC'}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#A6863A] truncate">
                    {seat.role_name}
                  </p>
                  <p className="text-xs font-bold text-[#0B1F3A] dark:text-white truncate">
                    {seat.full_name || 'Por designar'}
                  </p>
                  <p className="text-[11px] text-slate-500 font-mono-tabular truncate">
                    {seat.member_code || seat.email || 'Sem titular ativo'}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Dynamic Territorial Coverage Matrix */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6">
        <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white mb-4">
          Cobertura Territorial ({growthByProvince.length} {growthByProvince.length === 1 ? 'Província Ativa' : 'Províncias Ativas'})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <th className="py-2 pr-4 font-semibold">Província</th>
                <th className="py-2 pr-4 font-semibold">Sigla</th>
                <th className="py-2 pr-4 font-semibold">Estado da Coordenação</th>
                <th className="py-2 text-right font-semibold">Associados</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {growthByProvince.map((p) => (
                <tr key={p.code} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                  <td className="py-2.5 pr-4 font-medium text-slate-900 dark:text-white">{p.name}</td>
                  <td className="py-2.5 pr-4 font-mono-tabular text-slate-500">{p.code}</td>
                  <td className="py-2.5 pr-4">
                    <span
                      className={`font-semibold ${
                        p.coordination_status === 'ATIVA'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : p.coordination_status === 'SUSPENSA'
                            ? 'text-amber-600'
                            : 'text-slate-500'
                      }`}
                    >
                      {p.coordination_status}
                    </span>
                  </td>
                  <td className="py-2.5 text-right font-mono-tabular font-semibold text-[#0B1F3A] dark:text-white">
                    {p.members_count}
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
