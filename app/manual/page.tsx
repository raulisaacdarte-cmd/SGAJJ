import { BookOpen, Database, Lock, ShieldCheck } from 'lucide-react';
import { PublicHeader } from '@/components/PublicHeader';
import { PublicFooter } from '@/components/PublicFooter';

export default function ManualPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9FB] dark:bg-[#071121]">
      <PublicHeader />

      <main className="flex-1 mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 py-12 space-y-10">
        <div className="space-y-2 border-b border-slate-200 dark:border-slate-800 pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#A6863A] dark:text-[#C5A24D]">
            SGAJJ · Documentação Oficial
          </p>
          <h1 className="font-serif-display text-3xl sm:text-4xl font-bold text-[#0B1F3A] dark:text-white">
            Manual de Utilização e Documentação Técnica
          </h1>
        </div>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-3">
            <BookOpen className="h-5 w-5 text-[#A6863A]" />
            <h2 className="font-serif-display text-xl font-bold text-[#0B1F3A] dark:text-white">
              1. Fluxo de Adesão e Cartão Digital
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              O candidato preenche o formulário em <strong>/adesao</strong>, recebe um número único de acompanhamento (<span className="font-mono-tabular">AJJ-CAND-...</span>) e aguarda análise. Após aprovação pela Presidência ou Secretariado Nacional, o sistema gera um código permanente não reutilizável (<span className="font-mono-tabular">AJJ-PROV-ANO-SEQ</span>), cria a conta pessoal e emite o Cartão Digital com QR Code verificável em <strong>/verificar</strong>.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-3">
            <ShieldCheck className="h-5 w-5 text-[#A6863A]" />
            <h2 className="font-serif-display text-xl font-bold text-[#0B1F3A] dark:text-white">
              2. Nomeação Exclusiva de Coordenadores
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Apenas o <strong>Presidente da Associação</strong> tem acesso ao módulo de Nomeações. Ao aprovar uma nomeação provincial, o SGAJJ emite o Despacho de Nomeação e o Termo de Posse em PDF, regista a duração do mandato, cria o perfil institucional e ativa automaticamente o painel da coordenação provincial correspondente.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-3">
            <Database className="h-5 w-5 text-[#A6863A]" />
            <h2 className="font-serif-display text-xl font-bold text-[#0B1F3A] dark:text-white">
              3. Arquitetura Relacional e Backups
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              A base de dados relacional SQLite com integridade referencial (<span className="font-mono-tabular">PRAGMA foreign_keys = ON</span>) organiza 26 entidades interligadas: utilizadores, associados, candidaturas, 18 províncias e municípios, coordenações, nomeações, cartões, contas nacionais/provinciais, quotas, documentos versionados, publicações, gabinete jurídico, ética e auditoria imutável.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-3">
            <Lock className="h-5 w-5 text-[#A6863A]" />
            <h2 className="font-serif-display text-xl font-bold text-[#0B1F3A] dark:text-white">
              4. Segurança, MFA e Proteção de Dados
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Palavras-passe protegidas com bcrypt, sessões assinadas com HMAC-SHA256 em cookies HTTP-only, autenticação multifator (MFA) opcional para perfis privilegiados, encriptação AES-256-GCM para números de identificação civil e conformidade com a Lei n.º 22/11 de Angola.
            </p>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
