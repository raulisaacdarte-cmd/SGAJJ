import Link from 'next/link';
import { Award, CheckCircle2, XCircle, ArrowLeft } from 'lucide-react';
import { getDb } from '@/lib/db';
import { getPersonInitials } from '@/lib/domain';
import { PublicHeader } from '@/components/PublicHeader';
import { PublicFooter } from '@/components/PublicFooter';

export const dynamic = 'force-dynamic';

export default async function VerifyCodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const cleanCode = decodeURIComponent(code).trim();
  const db = getDb();

  const card = db.prepare(`
    SELECT dc.card_number, dc.member_code, dc.issued_at, dc.expires_at,
           dc.issuer_name, dc.status as card_status, dc.invalidated_reason,
           (dc.expires_at >= date('now')) as not_expired,
           m.full_name, m.photo_path, m.status as member_status,
           mc.name as category_name, p.name as province_name
    FROM digital_cards dc
    JOIN members m ON m.id = dc.member_id
    JOIN member_categories mc ON mc.id = m.category_id
    JOIN provinces p ON p.id = m.province_id
    WHERE dc.qr_token = ? OR UPPER(dc.member_code) = UPPER(?) OR UPPER(dc.card_number) = UPPER(?)
    ORDER BY dc.id DESC LIMIT 1
  `).get(cleanCode, cleanCode, cleanCode) as
    | {
        card_number: string;
        member_code: string;
        issued_at: string;
        expires_at: string;
        issuer_name: string;
        card_status: string;
        invalidated_reason: string | null;
        not_expired: number;
        full_name: string;
        photo_path: string | null;
        member_status: string;
        category_name: string;
        province_name: string;
      }
    | undefined;

  const cert = !card
    ? (db.prepare(`
        SELECT ar.certificate_code, ar.participant_name, ar.certificate_issued_at,
               a.title as activity_title, a.activity_type, a.start_datetime, a.location,
               p.name as province_name
        FROM activity_registrations ar
        JOIN activities a ON a.id = ar.activity_id
        LEFT JOIN provinces p ON p.id = a.province_id
        WHERE UPPER(ar.certificate_code) = UPPER(?)
      `).get(cleanCode) as
        | {
            certificate_code: string;
            participant_name: string;
            certificate_issued_at: string;
            activity_title: string;
            activity_type: string;
            start_datetime: string;
            location: string;
            province_name: string | null;
          }
        | undefined)
    : undefined;

  const isCardValid =
    card &&
    card.card_status === 'ATIVO' &&
    card.member_status === 'ATIVO' &&
    card.not_expired === 1;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9FB] dark:bg-[#071121]">
      <PublicHeader />

      <main className="flex-1 mx-auto w-full max-w-xl px-4 sm:px-6 py-14">
        <Link
          href="/verificar"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 mb-6 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Nova Verificação
        </Link>

        {card ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-8 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-5">
              <div className="flex items-center gap-3">
                <img
                  src="/assets/aistudio/IMG-20260804-WA0073_3cc94a37.jpg"
                  alt="AJJ"
                  className="h-10 w-10 rounded-full object-cover"
                />
                <div>
                  <p className="text-xs font-semibold text-[#A6863A]">Validação Oficial AJJ</p>
                  <p className="text-sm font-bold text-[#0B1F3A] dark:text-white">Cartão de Associado</p>
                </div>
              </div>
              {isCardValid ? (
                <div className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" />
                  <span>Válido</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 text-sm font-bold text-red-600">
                  <XCircle className="h-5 w-5" />
                  <span>Inválido / Suspenso</span>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-6">
              {card.photo_path ? (
                <img
                  src={card.photo_path}
                  alt={card.full_name}
                  className="h-28 w-24 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
                />
              ) : (
                <div className="h-28 w-24 rounded-lg bg-[#0B1F3A] text-white flex items-center justify-center font-serif-display text-2xl font-bold">
                  {getPersonInitials(card.full_name)}
                </div>
              )}

              <div className="space-y-2 text-center sm:text-left">
                <h1 className="font-serif-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
                  {card.full_name}
                </h1>
                <p className="font-mono-tabular text-sm font-semibold text-[#A6863A] dark:text-[#C5A24D]">
                  {card.member_code}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {card.category_name} · Província de {card.province_name}
                </p>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-4 border-t border-slate-200 dark:border-slate-800 pt-5 text-xs">
              <div>
                <dt className="text-slate-500">Situação Associativa</dt>
                <dd className="font-semibold text-slate-900 dark:text-white mt-0.5">{card.member_status}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Estado do Cartão</dt>
                <dd className="font-semibold text-slate-900 dark:text-white mt-0.5">{card.card_status}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Data de Emissão</dt>
                <dd className="font-mono-tabular font-semibold text-slate-900 dark:text-white mt-0.5">
                  {card.issued_at.slice(0, 10)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Validade</dt>
                <dd className="font-mono-tabular font-semibold text-slate-900 dark:text-white mt-0.5">
                  {card.expires_at.slice(0, 10)}
                </dd>
              </div>
            </dl>
          </div>
        ) : cert ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-8 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-2 text-[#0B1F3A] dark:text-white font-bold">
                <Award className="h-6 w-6 text-[#A6863A]" />
                <span>Certificado Digital Autêntico</span>
              </div>
              <span className="inline-flex items-center gap-1 text-sm font-bold text-emerald-600">
                <CheckCircle2 className="h-5 w-5" /> Válido
              </span>
            </div>
            <div className="space-y-2">
              <p className="font-mono-tabular text-xs text-[#A6863A]">{cert.certificate_code}</p>
              <h1 className="font-serif-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
                {cert.participant_name}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Atividade: <strong>{cert.activity_title}</strong> ({cert.activity_type})
              </p>
              <p className="text-xs text-slate-500">
                Local: {cert.location} · Data: {cert.start_datetime.slice(0, 10)}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-white dark:bg-[#0D1B30] p-8 text-center space-y-3">
            <XCircle className="h-10 w-10 text-red-600 mx-auto" />
            <h1 className="font-serif-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
              Registo Não Encontrado
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              O código <span className="font-mono-tabular font-semibold">{cleanCode}</span> não corresponde a nenhum cartão ou certificado ativo na base de dados oficial da AJJ.
            </p>
          </div>
        )}
      </main>

      <PublicFooter />
    </div>
  );
}
