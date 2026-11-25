import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANGOLA_PROVINCES,
  STATUTORY_ROLES,
  hasPermission,
  canAccessProvinceScope,
  generateMemberCode,
  isValidMemberCode,
  calculateMandateEndDate,
  calculateQuotaCompliance,
  slugify,
  getPersonInitials,
  normalizeProvinceCode,
  normalizeDepartmentCode,
  validateInitialStructure,
  getDefaultPanelTab,
  normalizePhoneDigits,
  requiresCentralValidationForLevel2,
  canProposeProvincialAppointment,
  computeLockoutState,
  buildActivationNotificationTemplates,
} from './domain';

test('Angola has all 18 provinces seeded with municipalities', () => {
  assert.equal(ANGOLA_PROVINCES.length, 18);
  for (const prov of ANGOLA_PROVINCES) {
    assert.ok(prov.municipalities.length > 0, `${prov.name} must have municipalities`);
  }
});

test('Statutory hierarchy defines 7 national, 7 provincial, and member roles', () => {
  const national = STATUTORY_ROLES.filter((r) => r.scope === 'NATIONAL');
  const provincial = STATUTORY_ROLES.filter((r) => r.scope === 'PROVINCIAL');
  assert.equal(national.length, 7);
  assert.equal(provincial.length, 7);
});

test('President has exclusive coordinator appointment & full admin control', () => {
  assert.equal(hasPermission('PRESIDENTE', 'APPOINT_COORDINATORS'), true);
  assert.equal(hasPermission('PRESIDENTE', 'ADMIN_FULL'), true);
  assert.equal(hasPermission('COORD_PROVINCIAL', 'APPOINT_COORDINATORS'), false);
  assert.equal(hasPermission('SECRETARIO_NACIONAL', 'APPOINT_COORDINATORS'), false);
  assert.equal(hasPermission('ASSOCIADO', 'MANAGE_MEMBERS_PROVINCE'), false);
});

test('Provincial scope isolates coordinator access to their own province', () => {
  assert.equal(canAccessProvinceScope('PRESIDENTE', null, 5), true);
  assert.equal(canAccessProvinceScope('COORD_PROVINCIAL', 11, 11), true);
  assert.equal(canAccessProvinceScope('COORD_PROVINCIAL', 11, 2), false);
  assert.equal(canAccessProvinceScope('ASSOCIADO', 11, 11), false);
});

test('Permanent member codes follow strict format and validate cleanly', () => {
  const code = generateMemberCode('LUA', 2026, 42);
  assert.equal(code, 'AJJ-LUA-2026-00042');
  assert.equal(isValidMemberCode(code), true);
  assert.equal(isValidMemberCode('INVALID-123'), false);
});

test('Mandate end date calculation respects statutory duration in months', () => {
  assert.equal(calculateMandateEndDate('2026-01-15', 24), '2028-01-15');
  assert.equal(calculateMandateEndDate('2026-03-01', 36), '2029-03-01');
});

test('Quota compliance computes delinquency status accurately', () => {
  const regular = calculateQuotaCompliance(6, 6, 2500);
  assert.equal(regular.status, 'REGULAR');
  assert.equal(regular.complianceRate, 100);
  assert.equal(regular.overdueAmountAoa, 0);

  const overdue = calculateQuotaCompliance(6, 2, 2500);
  assert.equal(overdue.status, 'INADIMPLENTE');
  assert.equal(overdue.overdueCount, 4);
  assert.equal(overdue.overdueAmountAoa, 10000);
});

test('Slugify normalizes Portuguese diacritics into clean SEO URLs', () => {
  assert.equal(
    slugify('Direitos Constitucionais e Educação Jurídica em Angola!'),
    'direitos-constitucionais-e-educacao-juridica-em-angola'
  );
});

test('getPersonInitials skips honorific prefixes like Dr. and Dra.', () => {
  assert.equal(getPersonInitials('Dra. Beatriz Ndongala'), 'BN');
  assert.equal(getPersonInitials('Dr. Manuel António Kiala'), 'MK');
  assert.equal(getPersonInitials('Ana'), 'AN');
});

test('Setup province and department code normalization and validation work accurately', () => {
  assert.equal(normalizeProvinceCode(' ícb '), 'ICB');
  assert.equal(normalizeDepartmentCode('Direitos Humanos & Cidadania'), 'DIREITOS_HUMANOS_CIDADANIA');

  const valid = validateInitialStructure(
    [
      { code: 'LUA', name: 'Luanda', is_active: true, municipalities: ['Luanda', 'Talatona'] },
      { code: 'ICB', name: 'Icolo e Bengo', is_active: true, municipalities: ['Catete'] },
    ],
    [
      { code: 'PRESIDENCIA', name: 'Presidência Nacional' },
      { code: 'Direitos Humanos', name: 'Departamento de Direitos Humanos', description: 'Defesa cívica' },
    ]
  );
  assert.equal(valid.ok, true);
  assert.equal(valid.provinces.length, 2);
  assert.equal(valid.departments[1].code, 'DIREITOS_HUMANOS');

  const noActive = validateInitialStructure(
    [{ code: 'LUA', name: 'Luanda', is_active: false }],
    [{ code: 'PRESIDENCIA', name: 'Presidência' }]
  );
  assert.equal(noActive.ok, false);
});

test('Role-based default panel tab mapping directs specialized roles cleanly', () => {
  assert.equal(getDefaultPanelTab('PRESIDENTE'), 'resumo');
  assert.equal(getDefaultPanelTab('SECRETARIO_NACIONAL'), 'resumo');
  assert.equal(getDefaultPanelTab('DIR_NAC_FINANCAS'), 'financeiro');
  assert.equal(getDefaultPanelTab('RESP_PROV_FINANCAS'), 'financeiro');
  assert.equal(getDefaultPanelTab('DIR_NAC_COMUNICACAO'), 'editorial');
  assert.equal(getDefaultPanelTab('RESP_PROV_COMUNICACAO'), 'editorial');
  assert.equal(getDefaultPanelTab('DIR_NAC_JURIDICO'), 'juridico_etica');
  assert.equal(getDefaultPanelTab('RESP_PROV_FISCALIZACAO'), 'juridico_etica');
  assert.equal(getDefaultPanelTab('DIR_NAC_PLANEAMENTO'), 'atividades');
  assert.equal(getDefaultPanelTab('ASSOCIADO'), 'resumo');
});

test('Phone normalization and Two-Level appointment authorization rules are enforced', () => {
  assert.equal(normalizePhoneDigits('+244 923 456 789'), '244923456789');
  assert.equal(requiresCentralValidationForLevel2('RESP_PROV_FINANCAS'), true);
  assert.equal(requiresCentralValidationForLevel2('RESP_PROV_FISCALIZACAO'), true);
  assert.equal(requiresCentralValidationForLevel2('RESP_PROV_JURIDICO'), true);
  assert.equal(requiresCentralValidationForLevel2('SEC_PROVINCIAL'), false);

  // Level 1 only President
  assert.equal(canProposeProvincialAppointment('PRESIDENTE', null, 11, 'COORD_PROVINCIAL'), true);
  assert.equal(canProposeProvincialAppointment('COORD_PROVINCIAL', 11, 11, 'COORD_PROVINCIAL'), false);
  // Level 2 Provincial Coordinator scoped strictly to own province
  assert.equal(canProposeProvincialAppointment('COORD_PROVINCIAL', 11, 11, 'RESP_PROV_FINANCAS'), true);
  assert.equal(canProposeProvincialAppointment('COORD_PROVINCIAL', 11, 2, 'RESP_PROV_FINANCAS'), false);
  assert.equal(canProposeProvincialAppointment('ASSOCIADO', 11, 11, 'SEC_PROVINCIAL'), false);
});

test('Lockout state locks account on 5th failed login attempt for 15 minutes', () => {
  const base = Date.UTC(2026, 4, 1, 12, 0, 0);
  const attempt4 = computeLockoutState(3, base);
  assert.equal(attempt4.nextAttempts, 4);
  assert.equal(attempt4.isLocked, false);
  assert.equal(attempt4.lockedUntilIso, null);

  const attempt5 = computeLockoutState(4, base);
  assert.equal(attempt5.nextAttempts, 5);
  assert.equal(attempt5.isLocked, true);
  assert.equal(attempt5.lockedUntilIso, new Date(base + 15 * 60 * 1000).toISOString());
});

test('Activation SMS and Email templates never contain plaintext passwords and include member code and link', () => {
  const adesao = buildActivationNotificationTemplates({
    fullName: 'Dra. Beatriz Ndongala',
    memberCode: 'AJJ-LUA-2026-00012',
    activationUrl: 'https://sgajj.ao/ativar?token=abc123',
    kind: 'ADESAO',
  });
  assert.ok(adesao.smsBody.includes('AJJ-LUA-2026-00012'));
  assert.ok(adesao.emailBody.includes('https://sgajj.ao/ativar?token=abc123'));
  assert.equal(adesao.emailBody.includes('AJJ2026!'), false);

  const nomeacao = buildActivationNotificationTemplates({
    fullName: 'Dr. Manuel Kiala',
    memberCode: 'AJJ-HUA-2026-00021',
    activationUrl: 'https://sgajj.ao/ativar?token=xyz999',
    kind: 'NOMEACAO',
    roleName: 'Coordenador Provincial',
    provinceName: 'Huambo',
  });
  assert.ok(nomeacao.smsBody.includes('Coordenador Provincial'));
  assert.ok(nomeacao.smsBody.includes('Huambo'));
  assert.ok(nomeacao.emailBody.includes('https://sgajj.ao/ativar?token=xyz999'));
  assert.equal(nomeacao.emailBody.includes('AJJCoord2026!'), false);
});


