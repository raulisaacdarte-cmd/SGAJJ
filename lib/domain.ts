export interface ProvinceSeed {
  code: string;
  name: string;
  municipalities: string[];
}

export const ANGOLA_PROVINCES: ProvinceSeed[] = [
  { code: 'BGO', name: 'Bengo', municipalities: ['Ambriz', 'Bula Atumba', 'Dande', 'Dembos', 'Nambuangongo', 'Pango Aluquém'] },
  { code: 'BGU', name: 'Benguela', municipalities: ['Balombo', 'Baía Farta', 'Benguela', 'Bocoio', 'Caimbambo', 'Catumbela', 'Chongorói', 'Cubal', 'Ganda', 'Lobito'] },
  { code: 'BIE', name: 'Bié', municipalities: ['Andulo', 'Camacupa', 'Catabola', 'Chinguar', 'Chitembo', 'Cuemba', 'Cunhinga', 'Cuíto', 'Nharea'] },
  { code: 'CAB', name: 'Cabinda', municipalities: ['Belize', 'Buco-Zau', 'Cabinda', 'Cacongo'] },
  { code: 'CCU', name: 'Cuando Cubango', municipalities: ['Calai', 'Cuangar', 'Cuchi', 'Cuito Cuanavale', 'Dirico', 'Mavinga', 'Menongue', 'Nancova', 'Rivungo'] },
  { code: 'CNO', name: 'Cuanza Norte', municipalities: ['Ambaca', 'Banga', 'Bolongongo', 'Cambambe', 'Cazengo', 'Golungo Alto', 'Gonguembo', 'Lucala', 'Quiculungo', 'Samba Cajú'] },
  { code: 'CSU', name: 'Cuanza Sul', municipalities: ['Amboim', 'Cassongue', 'Cela', 'Conda', 'Ebo', 'Libolo', 'Mussende', 'Porto Amboim', 'Quibala', 'Quilenda', 'Seles', 'Sumbe'] },
  { code: 'CUN', name: 'Cunene', municipalities: ['Cahama', 'Cuanhama', 'Curoca', 'Cuvelai', 'Namacunde', 'Ombadja'] },
  { code: 'HUA', name: 'Huambo', municipalities: ['Bailundo', 'Cachiungo', 'Caála', 'Ecunha', 'Huambo', 'Londuimbali', 'Longonjo', 'Mungo', 'Chicala-Choloanga', 'Chinjenje', 'Ucuma'] },
  { code: 'HUI', name: 'Huíla', municipalities: ['Caconda', 'Cacula', 'Caluquembe', 'Chiange', 'Chibia', 'Chicomba', 'Chipindo', 'Cuvango', 'Humpata', 'Jamba', 'Lubango', 'Matala', 'Quilengues', 'Quipungo'] },
  { code: 'LUA', name: 'Luanda', municipalities: ['Belas', 'Cacuaco', 'Cazenga', 'Ícolo e Bengo', 'Kilamba Kiaxi', 'Luanda', 'Quiçama', 'Talatona', 'Viana'] },
  { code: 'LNO', name: 'Lunda Norte', municipalities: ['Cambulo', 'Capenda-Camulemba', 'Caungula', 'Chitato', 'Cuango', 'Cuílo', 'Lóvua', 'Lubalo', 'Lucapa', 'Xá-Muteba'] },
  { code: 'LSU', name: 'Lunda Sul', municipalities: ['Cacolo', 'Dala', 'Muconda', 'Saurimo'] },
  { code: 'MAL', name: 'Malanje', municipalities: ['Cacuso', 'Calandula', 'Cambundi-Catembo', 'Cangandala', 'Caombo', 'Cuaba Nzoji', 'Cunda-Dia-Baze', 'Luquembo', 'Malanje', 'Marimba', 'Massango', 'Mucari', 'Quela', 'Quirima'] },
  { code: 'MOX', name: 'Moxico', municipalities: ['Alto Zambeze', 'Bundas', 'Camanongue', 'Léua', 'Luau', 'Luacano', 'Luchazes', 'Cameia', 'Moxico'] },
  { code: 'NAM', name: 'Namibe', municipalities: ['Bibala', 'Camucuio', 'Moçâmedes', 'Tômbua', 'Virei'] },
  { code: 'UIG', name: 'Uíge', municipalities: ['Alto Cauale', 'Ambuíla', 'Bembe', 'Buengas', 'Bungo', 'Damba', 'Milunga', 'Mucaba', 'Negage', 'Puri', 'Quimbele', 'Quitexe', 'Sanza Pombo', 'Songo', 'Uíge', 'Zombo'] },
  { code: 'ZAI', name: 'Zaire', municipalities: ['Cuimba', 'Mbanza Kongo', 'Nóqui', 'Nzeto', 'Soyo', 'Tomboco'] },
];

export type RoleScope = 'NATIONAL' | 'PROVINCIAL' | 'MEMBER';

export type RoleCode =
  | 'PRESIDENTE'
  | 'SECRETARIO_NACIONAL'
  | 'DIR_NAC_JURIDICO'
  | 'DIR_NAC_COMUNICACAO'
  | 'DIR_NAC_FINANCAS'
  | 'DIR_NAC_PLANEAMENTO'
  | 'DIR_NAC_FISCALIZACAO'
  | 'COORD_PROVINCIAL'
  | 'SEC_PROVINCIAL'
  | 'RESP_PROV_JURIDICO'
  | 'RESP_PROV_COMUNICACAO'
  | 'RESP_PROV_FINANCAS'
  | 'RESP_PROV_PLANEAMENTO'
  | 'RESP_PROV_FISCALIZACAO'
  | 'ASSOCIADO';

export interface RoleDefinition {
  code: RoleCode;
  name: string;
  scope: RoleScope;
  rank: number;
  departmentCode: string | null;
}

export const STATUTORY_ROLES: RoleDefinition[] = [
  { code: 'PRESIDENTE', name: 'Presidente da Associação', scope: 'NATIONAL', rank: 1, departmentCode: 'PRESIDENCIA' },
  { code: 'SECRETARIO_NACIONAL', name: 'Secretário Nacional', scope: 'NATIONAL', rank: 2, departmentCode: 'SECRETARIADO' },
  { code: 'DIR_NAC_JURIDICO', name: 'Diretor Nacional do Gabinete Jurídico', scope: 'NATIONAL', rank: 3, departmentCode: 'GABINETE_JURIDICO' },
  { code: 'DIR_NAC_COMUNICACAO', name: 'Diretor Nacional de Comunicação e Imagem', scope: 'NATIONAL', rank: 4, departmentCode: 'COMUNICACAO_IMAGEM' },
  { code: 'DIR_NAC_FINANCAS', name: 'Diretor Nacional de Finanças e Tesouraria', scope: 'NATIONAL', rank: 5, departmentCode: 'FINANCAS_TESOURARIA' },
  { code: 'DIR_NAC_PLANEAMENTO', name: 'Diretor Nacional de Planeamento e Logística', scope: 'NATIONAL', rank: 6, departmentCode: 'PLANEAMENTO_LOGISTICA' },
  { code: 'DIR_NAC_FISCALIZACAO', name: 'Diretor Nacional de Fiscalização e Ética', scope: 'NATIONAL', rank: 7, departmentCode: 'FISCALIZACAO_ETICA' },
  { code: 'COORD_PROVINCIAL', name: 'Coordenador Provincial', scope: 'PROVINCIAL', rank: 8, departmentCode: 'COORDENACAO' },
  { code: 'SEC_PROVINCIAL', name: 'Secretário Provincial', scope: 'PROVINCIAL', rank: 9, departmentCode: 'SECRETARIADO' },
  { code: 'RESP_PROV_JURIDICO', name: 'Secretário Provincial para o Gabinete Jurídico', scope: 'PROVINCIAL', rank: 10, departmentCode: 'GABINETE_JURIDICO' },
  { code: 'RESP_PROV_COMUNICACAO', name: 'Secretário Provincial para Comunicação e Imagem', scope: 'PROVINCIAL', rank: 11, departmentCode: 'COMUNICACAO_IMAGEM' },
  { code: 'RESP_PROV_FINANCAS', name: 'Secretário Provincial para Finanças e Tesouraria', scope: 'PROVINCIAL', rank: 12, departmentCode: 'FINANCAS_TESOURARIA' },
  { code: 'RESP_PROV_PLANEAMENTO', name: 'Secretário Provincial para Planeamento e Logística', scope: 'PROVINCIAL', rank: 13, departmentCode: 'PLANEAMENTO_LOGISTICA' },
  { code: 'RESP_PROV_FISCALIZACAO', name: 'Secretário Provincial para Fiscalização e Ética', scope: 'PROVINCIAL', rank: 14, departmentCode: 'FISCALIZACAO_ETICA' },
  { code: 'ASSOCIADO', name: 'Associado', scope: 'MEMBER', rank: 15, departmentCode: null },
];

export const STATUTORY_DEPARTMENTS = [
  { code: 'PRESIDENCIA', name: 'Presidência Nacional' },
  { code: 'COORDENACAO', name: 'Coordenação Provincial' },
  { code: 'SECRETARIADO', name: 'Secretariado Geral' },
  { code: 'GABINETE_JURIDICO', name: 'Gabinete Jurídico' },
  { code: 'COMUNICACAO_IMAGEM', name: 'Comunicação e Imagem' },
  { code: 'FINANCAS_TESOURARIA', name: 'Finanças e Tesouraria' },
  { code: 'PLANEAMENTO_LOGISTICA', name: 'Planeamento e Logística' },
  { code: 'FISCALIZACAO_ETICA', name: 'Fiscalização e Ética' },
];

export const MEMBER_CATEGORIES_SEED = [
  { code: 'SIMPLES', name: 'Associado Simples', monthly_quota_aoa: 2500, description: 'Licenciado em Direito ou jurista em exercício pleno dos direitos estatutários.' },
  { code: 'ESTUDANTE', name: 'Associado Estudante de Direito', monthly_quota_aoa: 1000, description: 'Estudante regularmente matriculado em Faculdade de Direito reconhecida em Angola.' },
  { code: 'ESPECIALIZADO', name: 'Associado Especializado', monthly_quota_aoa: 5000, description: 'Jurista com pós-graduação, mestrado, doutoramento ou especialidade jurídica certificada.' },
  { code: 'HONORARIO', name: 'Associado Honorário / Benemérito', monthly_quota_aoa: 0, description: 'Personalidade com mérito excecional na defesa da Justiça e dos Direitos Humanos.' },
];

export const VOZ_JURIDICA_CATEGORIES = [
  'Notícias institucionais',
  'Atualidade jurídica',
  'Opinião jurídica',
  'Artigos científicos',
  'Direitos Humanos',
  'Direito Constitucional',
  'Direito Penal',
  'Direito Civil',
  'Direito do Trabalho',
  'Direito Administrativo',
  'Direito da Família',
  'Educação jurídica',
  'Empreendedorismo jurídico',
  'Vídeos e entrevistas',
  'Podcasts e transmissões',
  'Comunicados institucionais',
] as const;

export const DOCUMENT_TYPES = [
  { code: 'ESTATUTO', label: 'Estatutos' },
  { code: 'ATA', label: 'Atas' },
  { code: 'REGULAMENTO', label: 'Regulamentos' },
  { code: 'DESPACHO', label: 'Despachos' },
  { code: 'TERMO_POSSE', label: 'Termos de Posse' },
  { code: 'CERTIFICADO', label: 'Certificados' },
  { code: 'RELATORIO', label: 'Relatórios' },
  { code: 'COMUNICADO', label: 'Comunicados' },
  { code: 'OFICIO', label: 'Ofícios' },
  { code: 'CORRESPONDENCIA', label: 'Correspondências' },
  { code: 'PLANO_ATIVIDADES', label: 'Planos de Atividades' },
  { code: 'DOCUMENTO_FINANCEIRO', label: 'Documentos Financeiros' },
] as const;

export const ACTIVITY_TYPES = [
  { code: 'CONFERENCIA', label: 'Conferência' },
  { code: 'SEMINARIO', label: 'Seminário' },
  { code: 'PALESTRA', label: 'Palestra' },
  { code: 'CURSO', label: 'Curso' },
  { code: 'WORKSHOP', label: 'Workshop' },
  { code: 'DEBATE', label: 'Debate' },
  { code: 'REUNIAO', label: 'Reunião' },
  { code: 'VISITA_INSTITUCIONAL', label: 'Visita Institucional' },
  { code: 'ATIVIDADE_PROVINCIAL', label: 'Atividade Provincial' },
] as const;

export type Permission =
  | 'ADMIN_FULL'
  | 'APPOINT_COORDINATORS'
  | 'MANAGE_USERS'
  | 'MANAGE_NATIONAL_FINANCE'
  | 'APPROVE_EXPENSES'
  | 'MANAGE_PROVINCIAL_FINANCE'
  | 'MANAGE_MEMBERS_ALL'
  | 'MANAGE_MEMBERS_PROVINCE'
  | 'APPROVE_APPLICATIONS'
  | 'PUBLISH_OFFICIAL_COMMUNIQUE'
  | 'PUBLISH_EDITORIAL'
  | 'APPROVE_EDITORIAL'
  | 'MANAGE_ACTIVITIES'
  | 'MANAGE_DOCUMENTS'
  | 'ACCESS_LEGAL_OFFICE'
  | 'ACCESS_ETHICS'
  | 'VIEW_AUDIT'
  | 'MANAGE_SETTINGS'
  | 'MANAGE_BACKUPS';

const ROLE_PERMISSIONS: Record<RoleCode, Permission[]> = {
  PRESIDENTE: [
    'ADMIN_FULL',
    'APPOINT_COORDINATORS',
    'MANAGE_USERS',
    'MANAGE_NATIONAL_FINANCE',
    'APPROVE_EXPENSES',
    'MANAGE_PROVINCIAL_FINANCE',
    'MANAGE_MEMBERS_ALL',
    'MANAGE_MEMBERS_PROVINCE',
    'APPROVE_APPLICATIONS',
    'PUBLISH_OFFICIAL_COMMUNIQUE',
    'PUBLISH_EDITORIAL',
    'APPROVE_EDITORIAL',
    'MANAGE_ACTIVITIES',
    'MANAGE_DOCUMENTS',
    'ACCESS_LEGAL_OFFICE',
    'ACCESS_ETHICS',
    'VIEW_AUDIT',
    'MANAGE_SETTINGS',
    'MANAGE_BACKUPS',
  ],
  SECRETARIO_NACIONAL: [
    'MANAGE_MEMBERS_ALL',
    'APPROVE_APPLICATIONS',
    'PUBLISH_OFFICIAL_COMMUNIQUE',
    'MANAGE_ACTIVITIES',
    'MANAGE_DOCUMENTS',
    'VIEW_AUDIT',
  ],
  DIR_NAC_JURIDICO: ['ACCESS_LEGAL_OFFICE', 'PUBLISH_EDITORIAL', 'MANAGE_DOCUMENTS', 'MANAGE_ACTIVITIES'],
  DIR_NAC_COMUNICACAO: ['PUBLISH_OFFICIAL_COMMUNIQUE', 'PUBLISH_EDITORIAL', 'APPROVE_EDITORIAL', 'MANAGE_DOCUMENTS'],
  DIR_NAC_FINANCAS: ['MANAGE_NATIONAL_FINANCE', 'MANAGE_PROVINCIAL_FINANCE', 'MANAGE_DOCUMENTS'],
  DIR_NAC_PLANEAMENTO: ['MANAGE_ACTIVITIES', 'MANAGE_DOCUMENTS'],
  DIR_NAC_FISCALIZACAO: ['ACCESS_ETHICS', 'VIEW_AUDIT', 'MANAGE_DOCUMENTS'],
  COORD_PROVINCIAL: [
    'MANAGE_MEMBERS_PROVINCE',
    'MANAGE_PROVINCIAL_FINANCE',
    'MANAGE_ACTIVITIES',
    'MANAGE_DOCUMENTS',
  ],
  SEC_PROVINCIAL: ['MANAGE_MEMBERS_PROVINCE', 'MANAGE_ACTIVITIES', 'MANAGE_DOCUMENTS'],
  RESP_PROV_JURIDICO: ['ACCESS_LEGAL_OFFICE', 'MANAGE_DOCUMENTS'],
  RESP_PROV_COMUNICACAO: ['PUBLISH_EDITORIAL', 'MANAGE_DOCUMENTS'],
  RESP_PROV_FINANCAS: ['MANAGE_PROVINCIAL_FINANCE', 'MANAGE_DOCUMENTS'],
  RESP_PROV_PLANEAMENTO: ['MANAGE_ACTIVITIES', 'MANAGE_DOCUMENTS'],
  RESP_PROV_FISCALIZACAO: ['ACCESS_ETHICS', 'MANAGE_DOCUMENTS'],
  ASSOCIADO: [],
};

export function isPresident(roleCode: string): boolean {
  return roleCode === 'PRESIDENTE';
}

export function isCentralDirectorate(roleCode: string): boolean {
  const def = STATUTORY_ROLES.find((r) => r.code === roleCode);
  return def?.scope === 'NATIONAL';
}

export function isProvincialRole(roleCode: string): boolean {
  const def = STATUTORY_ROLES.find((r) => r.code === roleCode);
  return def?.scope === 'PROVINCIAL';
}

export function hasPermission(roleCode: string, permission: Permission): boolean {
  if (roleCode === 'PRESIDENTE') return true;
  const perms = ROLE_PERMISSIONS[roleCode as RoleCode] || [];
  return perms.includes(permission);
}

export function canAccessProvinceScope(
  userRole: string,
  userProvinceId: number | null,
  targetProvinceId: number | null
): boolean {
  if (isCentralDirectorate(userRole)) return true;
  if (!isProvincialRole(userRole)) return false;
  if (targetProvinceId === null) return false;
  return userProvinceId === targetProvinceId;
}

export function generateMemberCode(provinceCode: string, year: number, sequenceNumber: number): string {
  const cleanProv = provinceCode.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3).padEnd(3, 'X');
  const seq = String(sequenceNumber).padStart(5, '0');
  return `AJJ-${cleanProv}-${year}-${seq}`;
}

export function isValidMemberCode(code: string): boolean {
  return /^AJJ-[A-Z]{3}-\d{4}-\d{5}$/.test(code);
}

export function generateTrackingNumber(year: number, sequenceNumber: number): string {
  return `AJJ-CAND-${year}-${String(sequenceNumber).padStart(5, '0')}`;
}

export function generateDispatchNumber(provinceCode: string, year: number, sequenceNumber: number): string {
  return `DESP-${provinceCode.toUpperCase()}-${year}/${String(sequenceNumber).padStart(3, '0')}`;
}

export function generateTermNumber(provinceCode: string, year: number, sequenceNumber: number): string {
  return `TP-${provinceCode.toUpperCase()}-${year}/${String(sequenceNumber).padStart(3, '0')}`;
}

export function generateReceiptNumber(year: number, sequenceNumber: number): string {
  return `REC-AJJ-${year}-${String(sequenceNumber).padStart(6, '0')}`;
}

export function generateCertificateCode(year: number, sequenceNumber: number): string {
  return `CERT-AJJ-${year}-${String(sequenceNumber).padStart(6, '0')}`;
}

export function generateCaseNumber(year: number, sequenceNumber: number): string {
  return `PROC-ETICA-${year}-${String(sequenceNumber).padStart(4, '0')}`;
}

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function calculateMandateEndDate(startDateIso: string, durationMonths: number): string {
  const date = new Date(startDateIso);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Data de início inválida');
  }
  const end = new Date(date.getTime());
  end.setUTCMonth(end.getUTCMonth() + durationMonths);
  return end.toISOString().slice(0, 10);
}

export function calculateQuotaCompliance(
  expectedQuotasCount: number,
  paidQuotasCount: number,
  monthlyAmountAoa: number
): {
  complianceRate: number;
  overdueCount: number;
  overdueAmountAoa: number;
  status: 'REGULAR' | 'ATRASO_MODERADO' | 'INADIMPLENTE';
} {
  const safeExpected = Math.max(0, expectedQuotasCount);
  const safePaid = Math.max(0, Math.min(paidQuotasCount, safeExpected));
  const overdueCount = safeExpected - safePaid;
  const complianceRate = safeExpected === 0 ? 100 : Math.round((safePaid / safeExpected) * 100);
  const overdueAmountAoa = overdueCount * Math.max(0, monthlyAmountAoa);
  let status: 'REGULAR' | 'ATRASO_MODERADO' | 'INADIMPLENTE' = 'REGULAR';
  if (overdueCount >= 3) {
    status = 'INADIMPLENTE';
  } else if (overdueCount >= 1) {
    status = 'ATRASO_MODERADO';
  }
  return { complianceRate, overdueCount, overdueAmountAoa, status };
}

export function formatAoa(amount: number): string {
  return new Intl.NumberFormat('pt-AO', {
    style: 'currency',
    currency: 'AOA',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

const HONORIFIC_PREFIXES = new Set(['dr', 'dra', 'sr', 'sra', 'prof', 'profa', 'eng', 'exmo', 'exma']);

export function getPersonInitials(fullName: string): string {
  const tokens = fullName
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/\.+$/, ''))
    .filter((t) => t.length > 0 && !HONORIFIC_PREFIXES.has(t.toLowerCase()));

  if (tokens.length === 0) {
    return fullName.trim().slice(0, 2).toUpperCase() || 'AJ';
  }
  if (tokens.length === 1) {
    return tokens[0].slice(0, 2).toUpperCase();
  }
  return `${tokens[0][0]}${tokens[tokens.length - 1][0]}`.toUpperCase();
}

export const CORE_STATUTORY_DEPARTMENT_CODES = new Set(
  STATUTORY_ROLES.map((r) => r.departmentCode).filter((c): c is string => Boolean(c))
);

export interface SetupProvinceInput {
  code: string;
  name: string;
  is_active?: boolean;
  municipalities?: string[];
}

export interface SetupDepartmentInput {
  code: string;
  name: string;
  description?: string;
}

export function normalizeProvinceCode(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

export function normalizeDepartmentCode(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
}

export function validateInitialStructure(
  provincesInput: SetupProvinceInput[],
  departmentsInput: SetupDepartmentInput[]
): {
  ok: boolean;
  error?: string;
  provinces: Array<{ code: string; name: string; is_active: boolean; municipalities: string[] }>;
  departments: Array<{ code: string; name: string; description: string }>;
} {
  const seenProvCodes = new Set<string>();
  const provinces: Array<{ code: string; name: string; is_active: boolean; municipalities: string[] }> = [];

  for (const item of provincesInput) {
    const code = normalizeProvinceCode(item.code || '');
    const name = (item.name || '').trim();
    if (!code || code.length < 2 || !name) {
      return { ok: false, error: 'Cada província deve possuir sigla (mín. 2 caracteres) e designação válidas.', provinces: [], departments: [] };
    }
    if (seenProvCodes.has(code)) {
      return { ok: false, error: `Código de província duplicado: ${code}.`, provinces: [], departments: [] };
    }
    seenProvCodes.add(code);
    const municipalities = Array.isArray(item.municipalities)
      ? item.municipalities.map((m) => m.trim()).filter(Boolean)
      : [];
    provinces.push({
      code,
      name,
      is_active: item.is_active !== false,
      municipalities,
    });
  }

  if (provinces.filter((p) => p.is_active).length === 0) {
    return { ok: false, error: 'Pelo menos uma província deve estar ativa na estrutura inicial da AJJ.', provinces: [], departments: [] };
  }

  const seenDeptCodes = new Set<string>();
  const departments: Array<{ code: string; name: string; description: string }> = [];

  for (const item of departmentsInput) {
    const code = normalizeDepartmentCode(item.code || item.name || '');
    const name = (item.name || '').trim();
    if (!code || !name) {
      return { ok: false, error: 'Cada departamento inicial deve possuir código e designação válidos.', provinces: [], departments: [] };
    }
    if (seenDeptCodes.has(code)) {
      return { ok: false, error: `Código de departamento duplicado: ${code}.`, provinces: [], departments: [] };
    }
    seenDeptCodes.add(code);
    departments.push({
      code,
      name,
      description: (item.description || '').trim(),
    });
  }

  if (departments.length === 0) {
    return { ok: false, error: 'Cadastre pelo menos um departamento inicial para a estrutura da AJJ.', provinces: [], departments: [] };
  }

  return { ok: true, provinces, departments };
}

export const LEVEL2_PROVINCIAL_ROLE_CODES: RoleCode[] = [
  'SEC_PROVINCIAL',
  'RESP_PROV_FINANCAS',
  'RESP_PROV_FISCALIZACAO',
  'RESP_PROV_PLANEAMENTO',
  'RESP_PROV_COMUNICACAO',
  'RESP_PROV_JURIDICO',
];

export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  PENDENTE: 'Inscrição recebida',
  EM_ANALISE: 'Em análise',
  AGUARDA_DOCUMENTACAO: 'Documentação incompleta',
  AGUARDA_VALIDACAO: 'Aguardando validação central',
  APROVADA: 'Aprovada',
  REJEITADA: 'Rejeitada',
  SUSPENSA: 'Suspensa',
};

export function getDefaultPanelTab(roleCode: string): string {
  switch (roleCode) {
    case 'DIR_NAC_FINANCAS':
    case 'RESP_PROV_FINANCAS':
      return 'financeiro';
    case 'DIR_NAC_COMUNICACAO':
    case 'RESP_PROV_COMUNICACAO':
      return 'editorial';
    case 'DIR_NAC_JURIDICO':
    case 'RESP_PROV_JURIDICO':
    case 'DIR_NAC_FISCALIZACAO':
    case 'RESP_PROV_FISCALIZACAO':
      return 'juridico_etica';
    case 'DIR_NAC_PLANEAMENTO':
    case 'RESP_PROV_PLANEAMENTO':
      return 'atividades';
    default:
      return 'resumo';
  }
}

export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function requiresCentralValidationForLevel2(roleCode: string): boolean {
  return (
    roleCode === 'RESP_PROV_FINANCAS' ||
    roleCode === 'RESP_PROV_FISCALIZACAO' ||
    roleCode === 'RESP_PROV_JURIDICO'
  );
}

export function canProposeProvincialAppointment(
  actorRole: string,
  actorProvinceId: number | null,
  targetProvinceId: number,
  targetRoleCode: string
): boolean {
  if (!isProvincialRole(targetRoleCode)) return false;
  if (actorRole === 'PRESIDENTE') return true;
  if (actorRole === 'COORD_PROVINCIAL') {
    if (targetRoleCode === 'COORD_PROVINCIAL') return false;
    return actorProvinceId !== null && actorProvinceId === targetProvinceId;
  }
  return false;
}

export function computeLockoutState(
  failedAttempts: number,
  nowMs: number,
  maxAttempts = 5,
  lockDurationMs = 15 * 60 * 1000
): { nextAttempts: number; isLocked: boolean; lockedUntilIso: string | null } {
  const nextAttempts = Math.max(0, failedAttempts) + 1;
  if (nextAttempts >= maxAttempts) {
    return {
      nextAttempts,
      isLocked: true,
      lockedUntilIso: new Date(nowMs + lockDurationMs).toISOString(),
    };
  }
  return {
    nextAttempts,
    isLocked: false,
    lockedUntilIso: null,
  };
}

export function buildActivationNotificationTemplates(params: {
  fullName: string;
  memberCode: string;
  activationUrl: string;
  kind: 'ADESAO' | 'NOMEACAO';
  roleName?: string;
  provinceName?: string;
}): {
  smsBody: string;
  emailSubject: string;
  emailBody: string;
} {
  const cleanName = params.fullName.trim();
  if (params.kind === 'NOMEACAO') {
    const cargo = params.roleName || 'Responsável Provincial';
    const prov = params.provinceName || 'Angola';
    return {
      smsBody: `AJJ: Foi nomeado(a) para o cargo de ${cargo} na provincia de ${prov}. Codigo de associado: ${params.memberCode}. Utilize o link de ativacao enviado para o seu e-mail para configurar o acesso.`,
      emailSubject: 'Bem-vindo(a) à Associação de Jovens Juristas — Acesso ao SGAJJ',
      emailBody: [
        `Prezado(a) ${cleanName},`,
        '',
        `A sua nomeação para o cargo de ${cargo} na província de ${prov} foi oficializada na plataforma da Associação de Jovens Juristas (AJJ).`,
        '',
        `Código de associado: ${params.memberCode}`,
        `Link de ativação: ${params.activationUrl}`,
        '',
        'Para concluir o seu primeiro acesso, clique no link acima e defina a sua palavra-passe individual.',
        '',
        'Associação de Jovens Juristas — Juntos em prol do bem maior.',
      ].join('\n'),
    };
  }

  return {
    smsBody: `AJJ: A sua adesao foi aprovada. Codigo de associado: ${params.memberCode}. Aceda ao portal atraves do link de ativacao enviado para o seu e-mail para definir a sua palavra-passe.`,
    emailSubject: 'Bem-vindo(a) à Associação de Jovens Juristas — Acesso ao SGAJJ',
    emailBody: [
      `Prezado(a) ${cleanName},`,
      '',
      'A sua adesão foi aprovada na plataforma da Associação de Jovens Juristas (AJJ).',
      '',
      `Código de associado: ${params.memberCode}`,
      `Link de ativação: ${params.activationUrl}`,
      '',
      'Para concluir o seu primeiro acesso, clique no link acima e defina a sua palavra-passe individual.',
      '',
      'Associação de Jovens Juristas — Juntos em prol do bem maior.',
    ].join('\n'),
  };
}


