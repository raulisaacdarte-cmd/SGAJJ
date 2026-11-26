'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, HelpCircle, KeyRound, Lock, Mail, RefreshCw, ShieldAlert } from 'lucide-react';
import { PublicHeader } from '@/components/PublicHeader';
import { PublicFooter } from '@/components/PublicFooter';

export default function LoginPage() {
  const router = useRouter();
  const [setupCompleted, setSetupCompleted] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'login' | 'recover' | 'resend'>('login');

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [trustedDevice, setTrustedDevice] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaHint, setMfaHint] = useState('');

  // Recovery
  const [recStep, setRecStep] = useState<'request' | 'reset'>('request');
  const [recEmail, setRecEmail] = useState('');
  const [recCode, setRecCode] = useState('');
  const [recPreview, setRecPreview] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [activationPendingEmail, setActivationPendingEmail] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resendingActivation, setResendingActivation] = useState(false);

  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/setup')
      .then((r) => r.json())
      .then((d) => setSetupCompleted(Boolean(d.setupCompleted)))
      .catch(() => setSetupCompleted(true));
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setActivationPendingEmail('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier,
          password,
          trustedDevice,
          mfaCode: mfaRequired ? mfaCode : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Falha na autenticação.');
        if (data.code === 'ACTIVATION_PENDING' || data.activationPending) {
          const detectedEmail = data.email || (identifier.includes('@') ? identifier : '');
          setActivationPendingEmail(detectedEmail);
          if (detectedEmail) setResendEmail(detectedEmail);
        }
      } else if (data.mfaRequired) {
        setMfaRequired(true);
        setInfo(data.message);
        if (data.demoMfaHint) setMfaHint(data.demoMfaHint);
      } else {
        const target = data.defaultTab && data.defaultTab !== 'resumo' ? `/painel?tab=${encodeURIComponent(data.defaultTab)}` : '/painel';
        router.push(target);
      }
    } catch {
      setError('Erro de comunicação com o servidor.');
    } finally {
      setLoading(false);
    }
  }

  async function requestActivationResend(targetEmail: string) {
    setError('');
    setInfo('');
    setResendingActivation(true);
    try {
      const res = await fetch('/api/auth/resend-activation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail }),
      });
      const data = await res.json();
      if (data.alreadyActivated) {
        setInfo(data.message);
        setActivationPendingEmail('');
        setMode('login');
      } else if (!res.ok || data.success === false) {
        setError(data.message || data.error || 'Não foi possível reenviar o link de ativação.');
      } else {
        setInfo(data.message || 'Novo e-mail de ativação enviado.');
        setActivationPendingEmail('');
        setMode('login');
      }
    } catch {
      setError('Erro de comunicação ao reenviar e-mail de ativação.');
    } finally {
      setResendingActivation(false);
    }
  }

  async function handleRecover(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const emailToUse = recEmail || identifier;
      const res = await fetch('/api/auth/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          recStep === 'request'
            ? { action: 'REQUEST', email: emailToUse }
            : { action: 'RESET', email: emailToUse, code: recCode, newPassword }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Erro ao processar recuperação.');
      } else {
        setInfo(data.message);
        if (recStep === 'request') {
          if (data.recoveryCodePreview) setRecPreview(data.recoveryCodePreview);
          setRecStep('reset');
        } else {
          setMode('login');
          setRecStep('request');
        }
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9FB] dark:bg-[#071121]">
      <PublicHeader />

      <main className="flex-1 flex items-center justify-center px-4 py-14">
        <div className="w-full max-w-md space-y-5">
          {setupCompleted === false && (
            <div className="rounded-xl border border-[#A6863A]/50 bg-[#A6863A]/10 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#0B1F3A] dark:text-[#C5A24D]">
                <ShieldAlert className="h-4 w-4" />
                <span>Primeiro Acesso ao Sistema</span>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300">
                Nenhuma conta da Presidência foi configurada ainda. Inicialize o sistema para criar o perfil do Presidente e configurar a AJJ.
              </p>
              <Link
                href="/setup"
                className="inline-block rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-4 py-2 text-xs font-semibold text-white whitespace-nowrap"
              >
                Configurar Presidência Inicial →
              </Link>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-8 space-y-6">
            <div className="flex items-center gap-3">
              <img
                src="/assets/aistudio/IMG-20260804-WA0073_3cc94a37.jpg"
                alt="Associação de Jovens Juristas"
                className="h-12 w-12 rounded-full object-cover border border-[#A6863A]/40"
              />
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-[#A6863A]">SGAJJ · Acesso Seguro</p>
                <h1 className="font-serif-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
                  {mode === 'login'
                    ? 'Portal Institucional'
                    : mode === 'recover'
                      ? 'Recuperar Palavra-Passe'
                      : 'Reenviar Link de Ativação'}
                </h1>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/40 dark:border-red-900 p-3 text-xs text-red-700 dark:text-red-300 space-y-2">
                <p>{error}</p>
                {activationPendingEmail && (
                  <button
                    type="button"
                    data-testid="login-resend-activation-btn"
                    disabled={resendingActivation}
                    onClick={() => requestActivationResend(activationPendingEmail)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#0B1F3A] dark:bg-[#A6863A] px-3 py-1.5 text-[11px] font-semibold text-white cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3 w-3 ${resendingActivation ? 'animate-spin' : ''}`} />
                    {resendingActivation ? 'A reenviar...' : 'Reenviar E-mail de Ativação'}
                  </button>
                )}
              </div>
            )}
            {info && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-900 p-3 text-xs text-emerald-800 dark:text-emerald-300">
                {info}
                {mfaHint && <p className="mt-1 font-mono-tabular font-bold">Código MFA emitido: {mfaHint}</p>}
                {recPreview && <p className="mt-1 font-mono-tabular font-bold">Código de recuperação: {recPreview}</p>}
              </div>
            )}

            {mode === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label htmlFor="loginEmail" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                    Código de Associado, Telefone ou E-mail
                  </label>
                  <input
                    id="loginEmail"
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="AJJ-LUA-2026-00001 · +244 9XX... · email@ajj-angola.org"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3.5 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="loginPass" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                    Palavra-Passe
                  </label>
                  <div className="relative">
                    <input
                      id="loginPass"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3.5 py-2.5 pr-10 text-sm"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-2.5 top-2.5 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    id="trustedDevice"
                    type="checkbox"
                    checked={trustedDevice}
                    onChange={(e) => setTrustedDevice(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span>Manter sessão iniciada em dispositivo confiável</span>
                </label>

                {mfaRequired && (
                  <div>
                    <label htmlFor="mfaInput" className="block text-xs font-semibold mb-1 text-[#A6863A]">
                      Código de Verificação MFA (6 dígitos)
                    </label>
                    <input
                      id="mfaInput"
                      required
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value)}
                      placeholder="000000"
                      className="w-full rounded-lg border border-[#A6863A] bg-white dark:bg-[#071121] px-3.5 py-2.5 text-sm font-mono-tabular"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] py-2.5 text-sm font-semibold text-white hover:bg-[#132E54] cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <Lock className="h-4 w-4" />
                  {loading ? 'A validar...' : mfaRequired ? 'Confirmar Código MFA' : 'Entrar no Sistema'}
                </button>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs border-t border-slate-100 dark:border-slate-800">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('recover');
                        if (identifier.includes('@')) setRecEmail(identifier);
                        setError('');
                        setInfo('');
                      }}
                      className="text-slate-600 dark:text-slate-400 hover:underline cursor-pointer"
                    >
                      Esqueceu a palavra-passe?
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('resend');
                        if (identifier.includes('@')) setResendEmail(identifier);
                        setError('');
                        setInfo('');
                      }}
                      className="text-[#0B1F3A] dark:text-[#C5A24D] font-semibold hover:underline cursor-pointer"
                    >
                      Reenviar ativação
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <Link href="/adesao" className="font-semibold text-[#A6863A] hover:underline">
                      Pedir Adesão
                    </Link>
                    <Link
                      href="/manual"
                      className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400 hover:underline"
                    >
                      <HelpCircle className="h-3.5 w-3.5" />
                      Suporte
                    </Link>
                  </div>
                </div>
              </form>
            ) : mode === 'resend' ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void requestActivationResend(resendEmail);
                }}
                className="space-y-4"
              >
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Introduza o endereço eletrónico utilizado na sua inscrição para receber um novo link exclusivo{' '}
                  <strong>«ATIVAR MINHA CONTA»</strong>.
                </p>
                <div>
                  <label htmlFor="resendActEmail" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                    E-mail da Inscrição / Conta
                  </label>
                  <input
                    id="resendActEmail"
                    type="email"
                    required
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    placeholder="nome@exemplo.ao"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3.5 py-2.5 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={resendingActivation}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] py-2.5 text-sm font-semibold text-white cursor-pointer whitespace-nowrap disabled:opacity-50"
                >
                  <Mail className="h-4 w-4" />
                  {resendingActivation ? 'A enviar...' : 'Reenviar E-mail de Ativação'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError('');
                    setInfo('');
                  }}
                  className="w-full text-center text-xs text-slate-500 hover:underline cursor-pointer"
                >
                  Voltar ao início de sessão
                </button>
              </form>
            ) : (
              <form onSubmit={handleRecover} className="space-y-4">
                <div>
                  <label htmlFor="recEmail" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                    E-mail da Conta
                  </label>
                  <input
                    id="recEmail"
                    type="email"
                    required
                    value={recEmail}
                    onChange={(e) => setRecEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3.5 py-2.5 text-sm"
                  />
                </div>
                {recStep === 'reset' && (
                  <>
                    <div>
                      <label htmlFor="recCode" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                        Código de Recuperação
                      </label>
                      <input
                        id="recCode"
                        required
                        value={recCode}
                        onChange={(e) => setRecCode(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3.5 py-2.5 text-sm font-mono-tabular"
                      />
                    </div>
                    <div>
                      <label htmlFor="recNewPass" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                        Nova Palavra-Passe
                      </label>
                      <input
                        id="recNewPass"
                        type="password"
                        required
                        minLength={6}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3.5 py-2.5 text-sm"
                      />
                    </div>
                  </>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] py-2.5 text-sm font-semibold text-white cursor-pointer whitespace-nowrap"
                >
                  <KeyRound className="h-4 w-4" />
                  {recStep === 'request' ? 'Solicitar Código' : 'Redefinir Palavra-Passe'}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="w-full text-center text-xs text-slate-500 hover:underline cursor-pointer"
                >
                  Voltar ao início de sessão
                </button>
              </form>
            )}
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
