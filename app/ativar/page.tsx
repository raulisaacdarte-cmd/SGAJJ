'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Eye, EyeOff, KeyRound, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import { PublicHeader } from '@/components/PublicHeader';
import { PublicFooter } from '@/components/PublicFooter';

interface TokenInfo {
  valid: boolean;
  code?: string;
  full_name?: string;
  email?: string;
  member_code?: string | null;
  role_name?: string;
  province_name?: string | null;
  error?: string;
}

function AtivarContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get('token') || '';

  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(() =>
    tokenFromUrl
      ? null
      : { valid: false, code: 'MISSING_TOKEN', error: 'Token de ativação ausente na ligação.' }
  );
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [trustedDevice, setTrustedDevice] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [activatedTab, setActivatedTab] = useState('resumo');

  // Resend link form for invalid/expired tokens
  const [resendEmail, setResendEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendFeedback, setResendFeedback] = useState<{ ok: boolean; text: string; alreadyActivated?: boolean } | null>(
    null
  );

  useEffect(() => {
    if (!tokenFromUrl) return;
    fetch(`/api/auth/activate?token=${encodeURIComponent(tokenFromUrl)}`)
      .then((r) => r.json())
      .then((d) => setTokenInfo(d))
      .catch(() =>
        setTokenInfo({
          valid: false,
          code: 'TOKEN_INVALID',
          error: 'Erro ao validar ligação de ativação.',
        })
      );
  }, [tokenFromUrl]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('A palavra-passe individual deve ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As palavras-passe introduzidas não coincidem.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: tokenFromUrl,
          password,
          confirmPassword,
          trustedDevice,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Não foi possível ativar a conta.');
      } else {
        const tab = data.defaultTab || 'resumo';
        setActivatedTab(tab);
        setDone(true);
        setTimeout(() => {
          router.push(`/painel?tab=${encodeURIComponent(tab)}`);
        }, 1200);
      }
    } catch {
      setError('Falha de comunicação com o servidor.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResendLink(e: React.FormEvent) {
    e.preventDefault();
    setResendFeedback(null);
    setResending(true);
    try {
      const res = await fetch('/api/auth/resend-activation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resendEmail }),
      });
      const data = await res.json();
      if (data.alreadyActivated) {
        setResendFeedback({ ok: true, text: data.message, alreadyActivated: true });
      } else if (!res.ok || data.success === false) {
        setResendFeedback({ ok: false, text: data.message || data.error || 'Não foi possível reenviar o link.' });
      } else {
        setResendFeedback({ ok: true, text: data.message || 'Novo link de ativação enviado por e-mail.' });
      }
    } catch {
      setResendFeedback({ ok: false, text: 'Erro de comunicação ao solicitar reenvio.' });
    } finally {
      setResending(false);
    }
  }

  const invalidHeading =
    tokenInfo?.code === 'TOKEN_EXPIRED'
      ? 'Link de Ativação Expirado'
      : tokenInfo?.code === 'TOKEN_USED'
        ? 'Link de Ativação Já Utilizado'
        : 'Link de Ativação Inválido';

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-14">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-8 space-y-6">
        <div className="flex items-center gap-3">
          <img
            src="/assets/aistudio/IMG-20260804-WA0073_3cc94a37.jpg"
            alt="AJJ"
            className="h-12 w-12 rounded-full object-cover border border-[#A6863A]/40"
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#A6863A]">SGAJJ · Ativação Segura</p>
            <h1 className="font-serif-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
              Ativar Minha Conta
            </h1>
          </div>
        </div>

        {!tokenInfo ? (
          <p className="text-xs text-slate-500 py-4">A verificar validade do token de ativação...</p>
        ) : !tokenInfo.valid ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/40 dark:border-red-900 p-4 space-y-1 text-xs text-red-700 dark:text-red-300">
              <p className="font-bold">{invalidHeading}</p>
              <p>{tokenInfo.error || 'Ligação inválida ou expirada.'}</p>
            </div>

            <form onSubmit={handleResendLink} className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F8F9FB] dark:bg-[#071121] p-4">
              <p className="text-xs font-bold text-[#0B1F3A] dark:text-white flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-[#A6863A]" /> Reenviar Link de Ativação
              </p>
              <input
                type="email"
                required
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                placeholder="Introduza o seu e-mail registado"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1B30] px-3 py-2 text-xs"
              />
              <button
                type="submit"
                disabled={resending}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] py-2 text-xs font-semibold text-white cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${resending ? 'animate-spin' : ''}`} />
                {resending ? 'A enviar novo link...' : 'Solicitar Novo Link de Ativação'}
              </button>
              {resendFeedback && (
                <p
                  className={`text-xs ${
                    resendFeedback.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {resendFeedback.text}
                </p>
              )}
            </form>

            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 py-2.5 text-xs font-semibold text-[#0B1F3A] dark:text-white hover:border-[#A6863A]"
            >
              Ir para Início de Sessão
            </Link>
          </div>
        ) : done ? (
          <div className="py-4 text-center space-y-4">
            <CheckCircle2 className="h-11 w-11 text-emerald-600 mx-auto" />
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-[#0B1F3A] dark:text-white">Conta Ativada com Sucesso</h2>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                A sua palavra-passe pessoal foi registada e a conta encontra-se ativa. A redirecionar para o painel SGAJJ...
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Link
                href={`/painel?tab=${encodeURIComponent(activatedTab)}`}
                className="flex-1 rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] py-2 text-xs font-semibold text-white"
              >
                Entrar no Painel
              </Link>
              <Link
                href="/login"
                className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                Iniciar Sessão
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F8F9FB] dark:bg-[#071121] p-4 space-y-1.5 text-xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Estado: Conta pendente de ativação
              </p>
              <p className="font-bold text-[#0B1F3A] dark:text-white">{tokenInfo.full_name}</p>
              {tokenInfo.email && <p className="font-mono-tabular text-[11px] text-slate-500">{tokenInfo.email}</p>}
              <p className="text-slate-600 dark:text-slate-300">
                Perfil: <span className="font-semibold">{tokenInfo.role_name}</span>
                {tokenInfo.province_name ? ` · ${tokenInfo.province_name}` : ''}
              </p>
              {tokenInfo.member_code && (
                <p className="font-mono-tabular text-[#A6863A] dark:text-[#C5A24D] font-bold">
                  Código de Associado: {tokenInfo.member_code}
                </p>
              )}
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/40 dark:border-red-900 p-3 text-xs text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="actPass" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                Definir Palavra-Passe Individual (mín. 6 caracteres) *
              </label>
              <div className="relative">
                <input
                  id="actPass"
                  type={showPass ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3.5 py-2.5 pr-10 text-sm"
                />
                <button
                  type="button"
                  aria-label={showPass ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-2.5 top-2.5 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="actConfirm" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                Confirmar Palavra-Passe *
              </label>
              <input
                id="actConfirm"
                type={showPass ? 'text' : 'password'}
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3.5 py-2.5 text-sm"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={trustedDevice}
                onChange={(e) => setTrustedDevice(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span>Manter sessão iniciada em dispositivo confiável</span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] py-2.5 text-sm font-semibold text-white hover:bg-[#132E54] cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <KeyRound className="h-4 w-4" />
              {loading ? 'A ativar conta...' : 'Ativar Conta e Definir Palavra-Passe'}
            </button>

            <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span>Link de utilização única. Nenhuma palavra-passe é transmitida por SMS ou e-mail.</span>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}

export default function AtivarContaPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9FB] dark:bg-[#071121]">
      <PublicHeader />
      <Suspense fallback={<div className="flex-1 flex items-center justify-center text-xs text-slate-500">A carregar...</div>}>
        <AtivarContent />
      </Suspense>
      <PublicFooter />
    </div>
  );
}
