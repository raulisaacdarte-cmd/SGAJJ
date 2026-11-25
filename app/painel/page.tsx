'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Award,
  Bell,
  BookOpen,
  Calendar,
  CreditCard,
  FileText,
  Gavel,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Settings,
  Sun,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import type { AuthUser } from '@/lib/auth';
import {
  getDefaultPanelTab,
  getPersonInitials,
  hasPermission,
  isCentralDirectorate,
  isProvincialRole,
} from '@/lib/domain';
import { useTheme } from '@/components/ThemeProvider';
import { PWAInstallButton } from '@/components/PWAInstallBanner';
import type { CatalogData } from '@/components/painel/types';
import { OverviewModule } from '@/components/painel/OverviewModule';
import { AppointmentsModule } from '@/components/painel/AppointmentsModule';
import { MembersModule } from '@/components/painel/MembersModule';
import { DigitalCardModule } from '@/components/painel/DigitalCardModule';
import { FinanceModule } from '@/components/painel/FinanceModule';
import { DocumentsModule } from '@/components/painel/DocumentsModule';
import { ActivitiesModule } from '@/components/painel/ActivitiesModule';
import { EditorialModule } from '@/components/painel/EditorialModule';
import { LegalEthicsModule } from '@/components/painel/LegalEthicsModule';
import { CommunicationsModule } from '@/components/painel/CommunicationsModule';
import { AdminModule } from '@/components/painel/AdminModule';

export default function PainelPage() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [activeTab, setActiveTab] = useState('resumo');
  const [unreadCount, setUnreadCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tabParam = new URLSearchParams(window.location.search).get('tab');

    Promise.all([
      fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/public/catalog').then((r) => r.json()),
    ])
      .then(([meData, catData]) => {
        if (!meData?.authenticated || !meData.user) {
          router.replace('/login');
          return;
        }
        setActiveTab(tabParam || getDefaultPanelTab(meData.user.role_code));
        setUser(meData.user);
        setCatalog(catData);
      })
      .finally(() => setLoading(false));
  }, [router]);

  // Real-time SSE notification listener
  useEffect(() => {
    if (!user) return;
    const evt = new EventSource('/api/notifications/stream');
    evt.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        if (typeof parsed.unreadCount === 'number') {
          setUnreadCount(parsed.unreadCount);
        }
      } catch {
        // ignore parse errors
      }
    };
    return () => evt.close();
  }, [user]);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  if (loading || !user || !catalog) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FB] dark:bg-[#071121] text-sm text-slate-500">
        A carregar ambiente institucional SGAJJ...
      </div>
    );
  }

  const resumoLabel =
    user.role_code === 'ASSOCIADO'
      ? 'Área Pessoal'
      : isProvincialRole(user.role_code)
        ? 'Painel Provincial'
        : isCentralDirectorate(user.role_code)
          ? 'Direção Central'
          : 'Dashboard Executivo';

  const navItems = [
    { id: 'resumo', label: resumoLabel, icon: LayoutDashboard, show: true },
    {
      id: 'nomeacoes',
      label: user.role_code === 'PRESIDENTE' ? 'Nomeações & Validação' : 'Equipa Provincial (Nível 2)',
      icon: Award,
      show: user.role_code === 'PRESIDENTE' || user.role_code === 'COORD_PROVINCIAL',
    },
    {
      id: 'associados',
      label: 'Associados e Adesões',
      icon: Users,
      show: hasPermission(user.role_code, 'MANAGE_MEMBERS_ALL') || hasPermission(user.role_code, 'MANAGE_MEMBERS_PROVINCE'),
    },
    { id: 'cartao', label: 'Cartão Digital e QR', icon: CreditCard, show: true },
    { id: 'financeiro', label: 'Gestão Financeira', icon: Wallet, show: true },
    { id: 'documentos', label: 'Arquivo Documental', icon: FileText, show: true },
    { id: 'atividades', label: 'Atividades e Formações', icon: Calendar, show: true },
    {
      id: 'editorial',
      label: 'A Voz Jurídica (CMS)',
      icon: BookOpen,
      show: hasPermission(user.role_code, 'PUBLISH_EDITORIAL') || hasPermission(user.role_code, 'APPROVE_EDITORIAL'),
    },
    {
      id: 'juridico_etica',
      label: 'Gabinete Jurídico e Ética',
      icon: Gavel,
      show: hasPermission(user.role_code, 'ACCESS_LEGAL_OFFICE') || hasPermission(user.role_code, 'ACCESS_ETHICS'),
    },
    { id: 'comunicacoes', label: 'Comunicações', icon: MessageSquare, show: true },
    { id: 'administracao', label: 'Administração & Auditoria', icon: Settings, show: user.role_code === 'PRESIDENTE' },
  ].filter((item) => item.show);

  const activeLabel = navItems.find((i) => i.id === activeTab)?.label || resumoLabel;

  return (
    <div className="min-h-screen flex bg-[#F8F9FB] dark:bg-[#071121] text-slate-900 dark:text-slate-100">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] flex flex-col transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 whitespace-nowrap">
            <img
              src={catalog.settings.logo_path || '/assets/aistudio/IMG-20260804-WA0073_3cc94a37.jpg'}
              alt="AJJ"
              className="h-9 w-9 rounded-full object-cover border border-[#A6863A]/40"
            />
            <span className="font-serif-display text-lg font-bold text-[#0B1F3A] dark:text-white">SGAJJ</span>
          </Link>
          <button
            type="button"
            aria-label="Fechar menu lateral"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-slate-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
          {user.photo_path ? (
            <img
              src={user.photo_path}
              alt={user.full_name}
              className="h-10 w-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
            />
          ) : (
            <div className="h-10 w-10 rounded-lg bg-[#0B1F3A] text-white flex items-center justify-center font-serif-display text-xs font-bold shrink-0">
              {getPersonInitials(user.full_name)}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#0B1F3A] dark:text-white truncate">{user.full_name}</p>
            <p className="text-[11px] text-[#A6863A] dark:text-[#C5A24D] truncate">{user.role_name}</p>
            <p className="text-[11px] text-slate-500 font-mono-tabular truncate">
              {user.member_code ? `${user.member_code}` : ''}
              {user.member_code && user.province_name ? ' · ' : ''}
              {user.province_name || (!user.member_code ? 'Âmbito Nacional' : '')}
            </p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition cursor-pointer text-left ${
                  active
                    ? 'bg-[#0B1F3A] dark:bg-[#A6863A] text-white font-semibold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <PWAInstallButton compact />
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
          >
            <LogOut className="h-4 w-4" /> Terminar Sessão
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Abrir menu lateral"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-800"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="text-xs text-slate-500 truncate">
              <span>SGAJJ</span>
              <span className="mx-2">/</span>
              <span className="font-semibold text-[#0B1F3A] dark:text-white">{activeLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              aria-label="Ver notificações"
              onClick={() => setActiveTab('comunicacoes')}
              className="relative inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium cursor-pointer"
            >
              <Bell className="h-4 w-4 text-[#A6863A]" />
              <span className="font-mono-tabular">{unreadCount}</span>
            </button>

            <button
              type="button"
              aria-label="Alternar tema claro ou escuro"
              onClick={toggleTheme}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4 text-[#C5A24D]" /> : <Moon className="h-4 w-4 text-[#0B1F3A]" />}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {activeTab === 'resumo' && <OverviewModule user={user} catalog={catalog} onNavigateTab={setActiveTab} />}
          {activeTab === 'nomeacoes' && <AppointmentsModule user={user} catalog={catalog} onNavigateTab={setActiveTab} />}
          {activeTab === 'associados' && <MembersModule user={user} catalog={catalog} onNavigateTab={setActiveTab} />}
          {activeTab === 'cartao' && <DigitalCardModule user={user} catalog={catalog} onNavigateTab={setActiveTab} />}
          {activeTab === 'financeiro' && <FinanceModule user={user} catalog={catalog} onNavigateTab={setActiveTab} />}
          {activeTab === 'documentos' && <DocumentsModule user={user} catalog={catalog} onNavigateTab={setActiveTab} />}
          {activeTab === 'atividades' && <ActivitiesModule user={user} catalog={catalog} onNavigateTab={setActiveTab} />}
          {activeTab === 'editorial' && <EditorialModule user={user} catalog={catalog} onNavigateTab={setActiveTab} />}
          {activeTab === 'juridico_etica' && <LegalEthicsModule user={user} catalog={catalog} onNavigateTab={setActiveTab} />}
          {activeTab === 'comunicacoes' && <CommunicationsModule user={user} catalog={catalog} onNavigateTab={setActiveTab} />}
          {activeTab === 'administracao' && <AdminModule user={user} catalog={catalog} onNavigateTab={setActiveTab} />}
        </main>
      </div>
    </div>
  );
}
