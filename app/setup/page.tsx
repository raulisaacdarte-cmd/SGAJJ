'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Building2,
  CheckCircle2,
  MapPin,
  Plus,
  RotateCcw,
  Shield,
  Trash2,
  Upload,
} from 'lucide-react';
import { PublicHeader } from '@/components/PublicHeader';
import { PublicFooter } from '@/components/PublicFooter';
import {
  ANGOLA_PROVINCES,
  CORE_STATUTORY_DEPARTMENT_CODES,
  STATUTORY_DEPARTMENTS,
  normalizeDepartmentCode,
  normalizeProvinceCode,
} from '@/lib/domain';

const OFFICIAL_LOGO_PATH = '/assets/aistudio/IMG-20260804-WA0073_3cc94a37.jpg';

interface ProvinceDraft {
  code: string;
  name: string;
  is_active: boolean;
  municipalities: string[];
  municipalities_count: number;
  is_custom?: boolean;
}

interface DepartmentDraft {
  code: string;
  name: string;
  description: string;
  is_core: boolean;
}

function buildDefaultProvinces(): ProvinceDraft[] {
  return ANGOLA_PROVINCES.map((p) => ({
    code: p.code,
    name: p.name,
    is_active: true,
    municipalities: [...p.municipalities],
    municipalities_count: p.municipalities.length,
    is_custom: false,
  }));
}

function buildDefaultDepartments(): DepartmentDraft[] {
  return STATUTORY_DEPARTMENTS.map((d) => ({
    code: d.code,
    name: d.name,
    description: '',
    is_core: CORE_STATUTORY_DEPARTMENT_CODES.has(d.code),
  }));
}

export default function SetupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [alreadyDone, setAlreadyDone] = useState(false);

  // 01. Institutional info & Logo
  const [orgName, setOrgName] = useState('Associação de Jovens Juristas');
  const [acronym, setAcronym] = useState('SGAJJ');
  const [slogan, setSlogan] = useState('Juntos em prol do bem maior.');
  const [nif, setNif] = useState('');
  const [headquarters, setHeadquarters] = useState('Luanda, República de Angola');
  const [contactEmail, setContactEmail] = useState('associacaodejovensjuristas@gmail.com');
  const [contactPhone, setContactPhone] = useState('');
  const [logoPath, setLogoPath] = useState(OFFICIAL_LOGO_PATH);
  const [logoUploadStatus, setLogoUploadStatus] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);

  // 02. Initial Provinces
  const [provinces, setProvinces] = useState<ProvinceDraft[]>(buildDefaultProvinces);
  const [newProvCode, setNewProvCode] = useState('');
  const [newProvName, setNewProvName] = useState('');
  const [newProvMuns, setNewProvMuns] = useState('');
  const [provError, setProvError] = useState('');

  // 03. Initial Departments
  const [departments, setDepartments] = useState<DepartmentDraft[]>(buildDefaultDepartments);
  const [newDeptCode, setNewDeptCode] = useState('');
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptDesc, setNewDeptDesc] = useState('');
  const [deptError, setDeptError] = useState('');

  // 04. President account
  const [presidentName, setPresidentName] = useState('');
  const [presidentEmail, setPresidentEmail] = useState('');
  const [presidentPhone, setPresidentPhone] = useState('+244 ');
  const [presidentPassword, setPresidentPassword] = useState('');
  const [enableMfa, setEnableMfa] = useState(false);
  const [seedInaugural, setSeedInaugural] = useState(true);

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/setup')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.setupCompleted) {
          setAlreadyDone(true);
        }
        if (data.settings) {
          setOrgName(data.settings.organization_name || 'Associação de Jovens Juristas');
          setAcronym(data.settings.acronym || 'SGAJJ');
          setSlogan(data.settings.slogan || 'Juntos em prol do bem maior.');
          setNif(data.settings.nif || '');
          setHeadquarters(data.settings.headquarters_address || 'Luanda, República de Angola');
          setContactEmail(data.settings.contact_email || 'associacaodejovensjuristas@gmail.com');
          setContactPhone(data.settings.contact_phone || '');
          setLogoPath(data.settings.logo_path || OFFICIAL_LOGO_PATH);
        }
        if (Array.isArray(data.provinces) && data.provinces.length > 0) {
          setProvinces(
            data.provinces.map(
              (p: { code: string; name: string; is_active: number; municipalities_count?: number }) => ({
                code: p.code,
                name: p.name,
                is_active: p.is_active !== 0,
                municipalities: [],
                municipalities_count: p.municipalities_count || 0,
                is_custom: !ANGOLA_PROVINCES.some((seed) => seed.code === p.code),
              })
            )
          );
        }
        if (Array.isArray(data.departments) && data.departments.length > 0) {
          setDepartments(
            data.departments.map((d: { code: string; name: string; description?: string; is_core?: boolean }) => ({
              code: d.code,
              name: d.name,
              description: d.description || '',
              is_core: Boolean(d.is_core) || CORE_STATUTORY_DEPARTMENT_CODES.has(d.code),
            }))
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogoUpload(file: File) {
    setLogoUploading(true);
    setLogoUploadStatus('');
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'branding');
      const res = await fetch('/api/uploads', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Não foi possível carregar o logotipo.');
      } else if (data.filePath) {
        setLogoPath(data.filePath);
        setLogoUploadStatus(`Logotipo carregado: ${data.fileName || file.name}`);
      }
    } catch {
      setError('Falha ao enviar o ficheiro do logotipo.');
    } finally {
      setLogoUploading(false);
    }
  }

  function handleAddProvince() {
    setProvError('');
    const code = normalizeProvinceCode(newProvCode || newProvName.slice(0, 3));
    const name = newProvName.trim();
    if (code.length < 2 || !name) {
      setProvError('Indique uma sigla válida (mín. 2 letras) e o nome da província.');
      return;
    }
    if (provinces.some((p) => p.code.toUpperCase() === code)) {
      setProvError(`Já existe uma província com a sigla ${code}.`);
      return;
    }
    const municipalities = newProvMuns
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);

    setProvinces((prev) => [
      ...prev,
      {
        code,
        name,
        is_active: true,
        municipalities,
        municipalities_count: municipalities.length,
        is_custom: true,
      },
    ]);
    setNewProvCode('');
    setNewProvName('');
    setNewProvMuns('');
  }

  function handleToggleProvince(code: string) {
    setProvError('');
    setProvinces((prev) => {
      const target = prev.find((p) => p.code === code);
      if (target?.is_active && prev.filter((p) => p.is_active).length <= 1) {
        setProvError('Pelo menos uma província deve permanecer ativa na estrutura inicial.');
        return prev;
      }
      return prev.map((p) => (p.code === code ? { ...p, is_active: !p.is_active } : p));
    });
  }

  function handleRemoveProvince(code: string) {
    setProvError('');
    setProvinces((prev) => {
      const next = prev.filter((p) => p.code !== code);
      if (next.filter((p) => p.is_active).length === 0) {
        setProvError('Mantenha pelo menos uma província ativa.');
        return prev;
      }
      return next;
    });
  }

  function handleAddDepartment() {
    setDeptError('');
    const name = newDeptName.trim();
    const code = normalizeDepartmentCode(newDeptCode || name);
    if (!name || !code) {
      setDeptError('Indique o código e a designação do departamento.');
      return;
    }
    if (departments.some((d) => d.code === code)) {
      setDeptError(`Já existe um departamento com o código ${code}.`);
      return;
    }
    setDepartments((prev) => [
      ...prev,
      {
        code,
        name,
        description: newDeptDesc.trim(),
        is_core: false,
      },
    ]);
    setNewDeptCode('');
    setNewDeptName('');
    setNewDeptDesc('');
  }

  function handleUpdateDepartment(code: string, field: 'name' | 'description', value: string) {
    setDepartments((prev) => prev.map((d) => (d.code === code ? { ...d, [field]: value } : d)));
  }

  function handleRemoveDepartment(code: string) {
    setDeptError('');
    setDepartments((prev) => prev.filter((d) => d.code !== code));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_name: orgName,
          acronym,
          slogan,
          nif,
          headquarters_address: headquarters,
          contact_email: contactEmail,
          contact_phone: contactPhone,
          logo_path: logoPath,
          president_name: presidentName,
          president_email: presidentEmail,
          president_phone: presidentPhone,
          president_password: presidentPassword,
          enable_mfa: enableMfa,
          seed_inaugural_content: seedInaugural,
          provinces: provinces.map((p) => ({
            code: p.code,
            name: p.name,
            is_active: p.is_active,
            municipalities: p.municipalities,
          })),
          departments: departments.map((d) => ({
            code: d.code,
            name: d.name,
            description: d.description,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Erro ao concluir configuração.');
      } else {
        router.push('/painel');
      }
    } catch {
      setError('Falha de comunicação com o servidor.');
    } finally {
      setSubmitting(false);
    }
  }

  const activeProvincesCount = provinces.filter((p) => p.is_active).length;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9FB] dark:bg-[#071121]">
      <PublicHeader />

      <main className="flex-1 mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 py-10">
        {loading ? (
          <div className="py-20 text-center text-sm text-slate-500">A verificar estado inicial da plataforma...</div>
        ) : alreadyDone ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-10 text-center space-y-4">
            <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
            <h1 className="font-serif-display text-2xl font-bold text-[#0B1F3A] dark:text-white text-balance">
              Configuração Inicial Já Concluída
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 max-w-lg mx-auto">
              A Presidência Nacional da Associação de Jovens Juristas já inicializou a estrutura base. Aceda ao portal institucional para gerir províncias, departamentos e associados.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-6 py-2.5 text-sm font-semibold text-white whitespace-nowrap shrink-0"
            >
              Ir para Autenticação
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 sm:p-10 space-y-8">
            {/* Institutional Setup Masthead */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b border-slate-200 dark:border-slate-800 pb-6">
              <div className="flex items-center gap-4">
                <img
                  src={logoPath}
                  alt="Logotipo Institucional da AJJ"
                  className="h-16 w-16 rounded-full object-cover border border-[#A6863A]/50 bg-white shrink-0"
                />
                <div className="space-y-1">
                  <p className="text-xs font-semibold tracking-wider uppercase text-[#A6863A]">
                    Configuração Inicial da Plataforma
                  </p>
                  <h1 className="font-serif-display text-2xl sm:text-3xl font-bold text-[#0B1F3A] dark:text-white text-balance">
                    Estrutura Base e Presidência da AJJ
                  </h1>
                </div>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono-tabular whitespace-nowrap">
                {activeProvincesCount} províncias ativas · {departments.length} departamentos
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/40 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-10">
              {/* 01. Institutional Identity & Logo */}
              <section className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-[#0B1F3A] dark:text-white flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-[#A6863A]" />
                      01. Informações Institucionais e Logotipo
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Defina os dados oficiais da associação e carregue ou confirme o emblema institucional usado nos cartões digitais e documentos.
                    </p>
                  </div>
                </div>

                {/* Logo Upload Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-5 py-4 border-y border-slate-100 dark:border-slate-800/80">
                  <img
                    src={logoPath}
                    alt="Pré-visualização do Logotipo"
                    className="h-20 w-20 rounded-full object-cover border border-[#A6863A]/50 bg-white shrink-0"
                  />
                  <div className="space-y-2 flex-1">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      Logotipo Oficial da Associação
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-[#0B1F3A] dark:text-white hover:border-[#A6863A] transition-colors cursor-pointer whitespace-nowrap shrink-0">
                        <Upload className="h-3.5 w-3.5 text-[#A6863A]" />
                        <span>{logoUploading ? 'A carregar...' : 'Carregar Logotipo'}</span>
                        <input
                          id="logoFileInput"
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="sr-only"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleLogoUpload(f);
                          }}
                        />
                      </label>
                      {logoPath !== OFFICIAL_LOGO_PATH && (
                        <button
                          type="button"
                          onClick={() => {
                            setLogoPath(OFFICIAL_LOGO_PATH);
                            setLogoUploadStatus('Logotipo oficial da AJJ restaurado.');
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-[#0B1F3A] cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Restaurar Emblema AJJ
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {logoUploadStatus || 'Formatos aceites: PNG, JPG ou WEBP (máx. 10 MB).'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label htmlFor="orgName" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                      Designação Oficial *
                    </label>
                    <input
                      id="orgName"
                      required
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="acronym" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                      Sigla da Plataforma
                    </label>
                    <input
                      id="acronym"
                      value={acronym}
                      onChange={(e) => setAcronym(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="slogan" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                      Lema / Slogan Oficial
                    </label>
                    <input
                      id="slogan"
                      value={slogan}
                      onChange={(e) => setSlogan(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="nif" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                      NIF / Registo Associativo
                    </label>
                    <input
                      id="nif"
                      value={nif}
                      onChange={(e) => setNif(e.target.value)}
                      placeholder="Ex.: 5000XXXXXX"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="hq" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                      Sede Nacional
                    </label>
                    <input
                      id="hq"
                      value={headquarters}
                      onChange={(e) => setHeadquarters(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="cEmail" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                      E-mail Institucional
                    </label>
                    <input
                      id="cEmail"
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="cPhone" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                      Contacto Telefónico
                    </label>
                    <input
                      id="cPhone"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </section>

              {/* 02. Initial Provinces */}
              <section className="border-t border-slate-200 dark:border-slate-800 pt-8 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-[#0B1F3A] dark:text-white flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-[#A6863A]" />
                      02. Províncias da Estrutura Territorial
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Pré-carregadas as 18 províncias de Angola. Pode adicionar novas circunscrições ou ativar/desativar províncias para o arranque inicial.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-mono-tabular text-slate-600 dark:text-slate-300">
                      {activeProvincesCount} / {provinces.length} ativas
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setProvinces(buildDefaultProvinces());
                        setProvError('');
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-[#A6863A] cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Repor 18 Províncias
                    </button>
                  </div>
                </div>

                {provError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{provError}</p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-2">
                    <label htmlFor="newProvCode" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                      Sigla
                    </label>
                    <input
                      id="newProvCode"
                      value={newProvCode}
                      onChange={(e) => setNewProvCode(e.target.value.toUpperCase())}
                      placeholder="Ex.: ICB"
                      maxLength={6}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs font-mono-tabular uppercase"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label htmlFor="newProvName" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                      Nome da Província
                    </label>
                    <input
                      id="newProvName"
                      value={newProvName}
                      onChange={(e) => setNewProvName(e.target.value)}
                      placeholder="Ex.: Icolo e Bengo"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label htmlFor="newProvMunicipalities" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                      Municípios iniciais (separados por vírgula)
                    </label>
                    <input
                      id="newProvMunicipalities"
                      value={newProvMuns}
                      onChange={(e) => setNewProvMuns(e.target.value)}
                      placeholder="Ex.: Catete, Cabiri, Bom Jesus"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddProvince}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-3 py-2 text-xs font-semibold text-white hover:bg-[#132E54] cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Plus className="h-3.5 w-3.5" /> Adicionar
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#071121]/60 text-slate-500">
                        <th className="py-2.5 px-3">Sigla</th>
                        <th className="py-2.5 px-3">Província</th>
                        <th className="py-2.5 px-3">Municípios</th>
                        <th className="py-2.5 px-3 text-right">Estado e Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      {provinces.map((prov) => (
                        <tr key={prov.code} className={prov.is_active ? '' : 'opacity-60'}>
                          <td className="py-2 px-3 font-mono-tabular font-semibold text-[#0B1F3A] dark:text-[#C5A24D]">
                            {prov.code}
                          </td>
                          <td className="py-2 px-3 font-medium text-slate-900 dark:text-white">{prov.name}</td>
                          <td className="py-2 px-3 font-mono-tabular text-slate-500">
                            {prov.municipalities_count} registados
                          </td>
                          <td className="py-2 px-3 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleToggleProvince(prov.code)}
                                className={`rounded border px-2.5 py-1 text-[11px] font-semibold cursor-pointer whitespace-nowrap shrink-0 ${
                                  prov.is_active
                                    ? 'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300'
                                    : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400'
                                }`}
                              >
                                {prov.is_active ? 'Ativa' : 'Inativa'}
                              </button>
                              {prov.is_custom && (
                                <button
                                  type="button"
                                  aria-label={`Remover província ${prov.name}`}
                                  onClick={() => handleRemoveProvince(prov.code)}
                                  className="inline-flex items-center justify-center rounded border border-red-200 dark:border-red-900 p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* 03. Initial Departments */}
              <section className="border-t border-slate-200 dark:border-slate-800 pt-8 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-[#0B1F3A] dark:text-white">
                      03. Departamentos Iniciais da AJJ
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Personalize as designações e atribuições dos órgãos estatutários ou cadastre novos departamentos de apoio.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-mono-tabular text-slate-600 dark:text-slate-300">
                      {departments.length} departamentos
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setDepartments(buildDefaultDepartments());
                        setDeptError('');
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-[#A6863A] cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Repor Estatutários
                    </button>
                  </div>
                </div>

                {deptError && <p className="text-xs text-red-600 dark:text-red-400">{deptError}</p>}

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-3">
                    <label htmlFor="newDeptCode" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                      Código (opcional)
                    </label>
                    <input
                      id="newDeptCode"
                      value={newDeptCode}
                      onChange={(e) => setNewDeptCode(e.target.value.toUpperCase())}
                      placeholder="Ex.: FORMACAO_ACADEMICA"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs font-mono-tabular uppercase"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label htmlFor="newDeptName" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                      Designação do Departamento
                    </label>
                    <input
                      id="newDeptName"
                      value={newDeptName}
                      onChange={(e) => setNewDeptName(e.target.value)}
                      placeholder="Ex.: Formação e Investigação Jurídica"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label htmlFor="newDeptDesc" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                      Descrição sumária
                    </label>
                    <input
                      id="newDeptDesc"
                      value={newDeptDesc}
                      onChange={(e) => setNewDeptDesc(e.target.value)}
                      placeholder="Competências principais"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddDepartment}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-3 py-2 text-xs font-semibold text-white hover:bg-[#132E54] cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Plus className="h-3.5 w-3.5" /> Cadastrar
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                  {departments.map((dept) => (
                    <div key={dept.code} className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-3 items-center">
                      <div className="sm:col-span-3">
                        <p className="font-mono-tabular text-xs font-semibold text-[#0B1F3A] dark:text-[#C5A24D]">
                          {dept.code}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {dept.is_core ? 'Órgão estatutário base' : 'Departamento adicional'}
                        </p>
                      </div>
                      <div className="sm:col-span-4">
                        <input
                          aria-label={`Nome do departamento ${dept.code}`}
                          value={dept.name}
                          onChange={(e) => handleUpdateDepartment(dept.code, 'name', e.target.value)}
                          className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#071121] px-2.5 py-1.5 text-xs font-medium"
                        />
                      </div>
                      <div className="sm:col-span-4">
                        <input
                          aria-label={`Descrição do departamento ${dept.code}`}
                          value={dept.description}
                          placeholder="Descrição das atribuições (opcional)"
                          onChange={(e) => handleUpdateDepartment(dept.code, 'description', e.target.value)}
                          className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#071121] px-2.5 py-1.5 text-xs"
                        />
                      </div>
                      <div className="sm:col-span-1 text-right">
                        {!dept.is_core && (
                          <button
                            type="button"
                            aria-label={`Remover departamento ${dept.name}`}
                            onClick={() => handleRemoveDepartment(dept.code)}
                            className="inline-flex items-center justify-center rounded border border-red-200 dark:border-red-900 p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* 04. President Account */}
              <section className="border-t border-slate-200 dark:border-slate-800 pt-8 space-y-4">
                <h2 className="text-base font-bold text-[#0B1F3A] dark:text-white flex items-center gap-2">
                  <Shield className="h-4 w-4 text-[#A6863A]" />
                  04. Conta do Presidente da Associação (Controlo Administrativo Total)
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="pName" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                      Nome Completo do Presidente *
                    </label>
                    <input
                      id="pName"
                      required
                      value={presidentName}
                      onChange={(e) => setPresidentName(e.target.value)}
                      placeholder="Dr. / Dra. Nome Completo"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="pEmail" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                      E-mail de Acesso *
                    </label>
                    <input
                      id="pEmail"
                      type="email"
                      required
                      value={presidentEmail}
                      onChange={(e) => setPresidentEmail(e.target.value)}
                      placeholder="associacaodejovensjuristas@gmail.com"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="pPhone" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                      Telemóvel
                    </label>
                    <input
                      id="pPhone"
                      value={presidentPhone}
                      onChange={(e) => setPresidentPhone(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="pPass" className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                      Palavra-Passe Segura (mín. 6 caracteres) *
                    </label>
                    <input
                      id="pPass"
                      type="password"
                      required
                      minLength={6}
                      value={presidentPassword}
                      onChange={(e) => setPresidentPassword(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="space-y-2.5 pt-2">
                  <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableMfa}
                      onChange={(e) => setEnableMfa(e.target.checked)}
                      className="h-4 w-4 rounded"
                    />
                    <span>Ativar Autenticação Multifator (MFA) no início de sessão do Presidente</span>
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={seedInaugural}
                      onChange={(e) => setSeedInaugural(e.target.checked)}
                      className="h-4 w-4 rounded"
                    />
                    <span>Publicar nota editorial inaugural em “A Voz Jurídica” e Fórum Nacional de abertura</span>
                  </label>
                </div>
              </section>

              <div className="border-t border-slate-200 dark:border-slate-800 pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
                  Estrutura pronta: {activeProvincesCount} províncias ativas · {departments.length} departamentos iniciais
                </p>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center justify-center rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-6 py-3 text-sm font-semibold text-white hover:bg-[#132E54] disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
                >
                  {submitting ? 'A inicializar plataforma SGAJJ...' : 'Concluir Configuração e Aceder ao Painel'}
                </button>
              </div>
            </form>
          </div>
        )}
      </main>

      <PublicFooter />
    </div>
  );
}
