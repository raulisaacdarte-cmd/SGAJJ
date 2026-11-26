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
  ANGOLAN_BANKS,
  AJJ_INSTITUTIONAL_IBAN_RAW,
  AJJ_INSTITUTIONAL_IBAN_DISPLAY,
  AJJ_INSTITUTIONAL_IBAN_AO06,
  normalizeAngolanIban,
  formatRupeCode,
  generateRupeReference,
  isValidRupeCode,
  buildAngolanBankPaymentInstructions,
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

test('Activation SMS and Email templates never contain plaintext passwords and include role scope and link', () => {
  const adesao = buildActivationNotificationTemplates({
    fullName: 'Dra. Beatriz Ndongala',
    memberCode: 'AJJ-LUA-2026-00012',
    activationUrl: 'https://sgajj.ao/ativar?token=abc123',
    kind: 'ADESAO',
  });
  assert.ok(adesao.smsBody.includes('AJJ-LUA-2026-00012'));
  assert.ok(adesao.smsBody.includes('https://sgajj.ao/ativar?token=abc123'));
  assert.ok(adesao.emailBody.includes('https://sgajj.ao/ativar?token=abc123'));
  assert.equal(adesao.emailBody.includes('AJJ2026!'), false);

  const nomeacaoProvincial = buildActivationNotificationTemplates({
    fullName: 'Dr. Manuel Kiala',
    memberCode: 'AJJ-HUA-2026-00021',
    activationUrl: 'https://sgajj.ao/ativar?token=xyz999',
    kind: 'NOMEACAO',
    roleName: 'Coordenador Provincial',
    roleScope: 'PROVINCIAL',
    provinceName: 'Huambo',
    dispatchNumber: 'DESP-HUA-2026-00003',
  });
  assert.ok(nomeacaoProvincial.smsBody.includes('Coordenador Provincial'));
  assert.ok(nomeacaoProvincial.smsBody.includes('Huambo'));
  assert.ok(nomeacaoProvincial.smsBody.includes('https://sgajj.ao/ativar?token=xyz999'));
  assert.ok(nomeacaoProvincial.emailBody.includes('DESP-HUA-2026-00003'));
  assert.ok(nomeacaoProvincial.emailBody.includes('https://sgajj.ao/ativar?token=xyz999'));
  assert.equal(nomeacaoProvincial.emailBody.includes('AJJCoord2026!'), false);

  const nomeacaoDirecaoCentral = buildActivationNotificationTemplates({
    fullName: 'Dr. João Mbala',
    memberCode: null,
    activationUrl: 'https://sgajj.ao/ativar?token=dir777',
    kind: 'NOMEACAO',
    roleName: 'Diretor Nacional para Assuntos Jurídicos',
    roleScope: 'NATIONAL',
    provinceName: null,
  });
  assert.ok(nomeacaoDirecaoCentral.emailSubject.includes('Direção Central'));
  assert.ok(nomeacaoDirecaoCentral.emailBody.includes('Direção Central da Associação de Jovens Juristas'));
  assert.equal(nomeacaoDirecaoCentral.emailBody.includes('província de Angola'), false);
  assert.ok(nomeacaoDirecaoCentral.smsBody.includes('Direcao Central'));
  assert.ok(nomeacaoDirecaoCentral.smsBody.includes('https://sgajj.ao/ativar?token=dir777'));

  const inscricao = buildActivationNotificationTemplates({
    fullName: 'Helena Mateus',
    activationUrl: 'https://sgajj.ao/ativar?token=insc555',
    kind: 'ADESAO',
    phase: 'INSCRICAO',
    trackingNumber: 'AJJ-CAND-2026-00010',
  });
  assert.ok(inscricao.emailSubject.includes('ATIVAR MINHA CONTA'));
  assert.ok(inscricao.emailBody.includes('AJJ-CAND-2026-00010'));
  assert.ok(inscricao.emailBody.includes('ATIVAR MINHA CONTA'));
  assert.ok(inscricao.emailBody.includes('https://sgajj.ao/ativar?token=insc555'));
});

test('Angolan IBAN normalization parses BAI institutional IBAN 0040 0000 96614389101 60 accurately', () => {
  const parsed = normalizeAngolanIban('AO06 0040 0000 96614389101 60');
  assert.equal(parsed.valid, true);
  assert.equal(parsed.raw21, AJJ_INSTITUTIONAL_IBAN_RAW);
  assert.equal(parsed.display21, AJJ_INSTITUTIONAL_IBAN_DISPLAY);
  assert.equal(parsed.fullAo06, AJJ_INSTITUTIONAL_IBAN_AO06);
  assert.equal(parsed.bankBnaCode, '0040');
  assert.equal(parsed.branchCode, '0000');
  assert.equal(parsed.accountPart, '96614389101');
  assert.equal(parsed.checkDigits, '60');

  const fallback = normalizeAngolanIban('INVALID-IBAN');
  assert.equal(fallback.valid, false);
  assert.equal(fallback.raw21, AJJ_INSTITUTIONAL_IBAN_RAW);
});

test('Automatic Mod-97 RUPE generator anchors to institutional IBAN and detects tampering', () => {
  const r1 = generateRupeReference({ iban: '0040 0000 96614389101 60', sequenceNumber: 1, year: 2026 });
  const r2 = generateRupeReference({ iban: '0040 0000 96614389101 60', sequenceNumber: 2, year: 2026 });

  assert.equal(r1.rupeCode.length, 20);
  assert.ok(r1.rupeCode.startsWith('004096614326'));
  assert.equal(r1.rupeFormatted, formatRupeCode(r1.rupeCode));
  assert.equal(isValidRupeCode(r1.rupeCode), true);
  assert.equal(isValidRupeCode(r1.rupeFormatted), true);
  assert.equal(isValidRupeCode(r2.rupeCode), true);
  assert.notEqual(r1.rupeCode, r2.rupeCode);

  const tampered = `${r1.rupeCode.slice(0, 19)}${r1.rupeCode.endsWith('9') ? '0' : '9'}`;
  assert.equal(isValidRupeCode(tampered), false);
  assert.equal(isValidRupeCode('12345'), false);
});

test('Angolan bank catalog covers BAI, BIC, BFA, BCI, and Multicaixa Express with tailored instructions', () => {
  const codes = ANGOLAN_BANKS.map((b) => b.code);
  assert.deepEqual(codes, ['BAI', 'BIC', 'BFA', 'BCI', 'MULTICAIXA']);

  const rupe = generateRupeReference({ sequenceNumber: 15, year: 2026 });
  for (const bank of ANGOLAN_BANKS) {
    const instr = buildAngolanBankPaymentInstructions({
      bankCode: bank.code,
      rupeFormatted: rupe.rupeFormatted,
      amountAoa: 2500,
      referenceMonth: '2026-11',
      memberCode: 'AJJ-LUA-2026-00015',
    });
    assert.equal(instr.bank.code, bank.code);
    assert.equal(instr.steps.length, 4);
    const joined = instr.steps.join(' ');
    assert.ok(joined.includes(rupe.rupeFormatted), `Instructions for ${bank.code} must include RUPE`);
    assert.ok(joined.includes('0040 0000 96614389101 60'), `Instructions for ${bank.code} must include IBAN`);
  }
});




