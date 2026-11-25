import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, getNextSequence, writeAuditLog, applyInitialStructure, createActivationToken } from './db';
import { encryptSensitive, decryptSensitive, hashPassword, verifyPassword, hashToken } from './crypto';
import { generateMemberCode } from './domain';

test('Relational SQLite database seeds 18 provinces, 15 statutory roles, and financial accounts', () => {
  const db = createTestDb();
  const provinces = (db.prepare('SELECT COUNT(*) as c FROM provinces').get() as { c: number }).c;
  const roles = (db.prepare('SELECT COUNT(*) as c FROM roles').get() as { c: number }).c;
  const accounts = (db.prepare('SELECT COUNT(*) as c FROM financial_accounts').get() as { c: number }).c;
  assert.equal(provinces, 18);
  assert.equal(roles, 15);
  assert.equal(accounts, 19); // 1 National + 18 Provincial
});

test('Sequences generate strictly unique, non-reusable permanent member codes', () => {
  const db = createTestDb();
  const s1 = getNextSequence(db, 'MEMBER_2026');
  const s2 = getNextSequence(db, 'MEMBER_2026');
  assert.equal(s1, 1);
  assert.equal(s2, 2);
  const code1 = generateMemberCode('LUA', 2026, s1);
  const code2 = generateMemberCode('LUA', 2026, s2);
  assert.notEqual(code1, code2);
  assert.equal(code1, 'AJJ-LUA-2026-00001');
  assert.equal(code2, 'AJJ-LUA-2026-00002');
});

test('AES-256-GCM field encryption and password hashing work accurately', () => {
  const bi = '005412987LA042';
  const encrypted = encryptSensitive(bi);
  assert.ok(encrypted && encrypted !== bi);
  assert.equal(decryptSensitive(encrypted), bi);

  const hash = hashPassword('Jurista@2026');
  assert.equal(verifyPassword('Jurista@2026', hash), true);
  assert.equal(verifyPassword('Errada', hash), false);
});

test('Audit logs capture immutable institutional operations and state diffs', () => {
  const db = createTestDb();
  writeAuditLog(db, {
    userId: 1,
    userName: 'Dr. Presidente',
    roleCode: 'PRESIDENTE',
    action: 'NOMEACAO_APROVADA',
    entityType: 'appointment',
    entityId: 10,
    details: { province: 'Luanda' },
    previousState: { status: 'AGUARDA_VALIDACAO' },
    newState: { status: 'APROVADA' },
    supportingDocPath: '/uploads/appointments/despacho.pdf',
  });
  const row = db.prepare('SELECT * FROM audit_logs WHERE entity_type = ?').get('appointment') as {
    action: string;
    details_json: string;
    previous_state_json: string;
    new_state_json: string;
    supporting_doc_path: string;
  };
  assert.equal(row.action, 'NOMEACAO_APROVADA');
  assert.equal(JSON.parse(row.details_json).province, 'Luanda');
  assert.equal(JSON.parse(row.previous_state_json).status, 'AGUARDA_VALIDACAO');
  assert.equal(JSON.parse(row.new_state_json).status, 'APROVADA');
  assert.equal(row.supporting_doc_path, '/uploads/appointments/despacho.pdf');
});

test('createActivationToken stores SHA-256 hash and invalidates prior unused tokens', () => {
  const db = createTestDb();
  const uRes = db
    .prepare(
      `INSERT INTO users (email, phone, password_hash, full_name, role_code, activation_pending) VALUES (?, ?, ?, ?, ?, 1)`
    )
    .run('ativar@ajj.ao', '+244900000000', hashPassword('unused'), 'Dr. Teste', 'ASSOCIADO');
  const userId = Number(uRes.lastInsertRowid);

  const first = createActivationToken(db, userId, 'ACTIVATE', 48);
  const second = createActivationToken(db, userId, 'ACTIVATE', 48);

  const firstRow = db.prepare('SELECT used_at FROM activation_tokens WHERE token_hash = ?').get(hashToken(first.rawToken)) as {
    used_at: string | null;
  };
  const secondRow = db.prepare('SELECT used_at FROM activation_tokens WHERE token_hash = ?').get(hashToken(second.rawToken)) as {
    used_at: string | null;
  };

  assert.ok(firstRow.used_at !== null, 'First token should be invalidated when superseded');
  assert.equal(secondRow.used_at, null, 'Latest token must remain unused');
});

test('appointments schema supports two-level provincial proposals and central validation queue', () => {
  const db = createTestDb();
  const cols = (db.prepare('PRAGMA table_info(appointments)').all() as Array<{ name: string }>).map((c) => c.name);
  for (const required of ['level', 'candidate_photo_path', 'attachment_path', 'requires_central_validation', 'validated_by', 'validated_at']) {
    assert.ok(cols.includes(required), `appointments table missing ${required}`);
  }
});

test('applyInitialStructure adds custom provinces, departments, and financial accounts cleanly', () => {
  const db = createTestDb();
  applyInitialStructure(
    db,
    [
      { code: 'LUA', name: 'Luanda', is_active: true, municipalities: [] },
      { code: 'ICB', name: 'Icolo e Bengo', is_active: true, municipalities: ['Catete', 'Quiçama'] },
    ],
    [
      { code: 'PRESIDENCIA', name: 'Presidência Nacional', description: 'Órgão máximo' },
      { code: 'DIREITOS_HUMANOS', name: 'Direitos Humanos', description: 'Proteção cívica' },
    ]
  );

  const icb = db.prepare('SELECT id, name FROM provinces WHERE code = ?').get('ICB') as { id: number; name: string };
  assert.equal(icb.name, 'Icolo e Bengo');
  const icbCoord = db.prepare('SELECT status FROM coordinations WHERE province_id = ?').get(icb.id) as { status: string };
  assert.equal(icbCoord.status, 'INATIVA');
  const icbAcc = db.prepare("SELECT name FROM financial_accounts WHERE scope = 'PROVINCIAL' AND province_id = ?").get(icb.id) as {
    name: string;
  };
  assert.equal(icbAcc.name, 'Fundo Provincial — Icolo e Bengo');
  const dept = db.prepare('SELECT name, description FROM departments WHERE code = ?').get('DIREITOS_HUMANOS') as {
    name: string;
    description: string;
  };
  assert.equal(dept.name, 'Direitos Humanos');
  assert.equal(dept.description, 'Proteção cívica');
});

