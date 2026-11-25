import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  getSupabaseConfigStatus,
  sanitizeUserRowForSupabase,
  stripSensitiveColumns,
  syncSingleEntityToSupabase,
  testSupabaseConnection,
} from './supabase';

test('getSupabaseConfigStatus omits secret keys and reports unconfigured state cleanly', () => {
  const prevUrl = process.env.SUPABASE_URL;
  const prevService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const prevAnon = process.env.SUPABASE_ANON_KEY;

  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_ANON_KEY;

  const emptyStatus = getSupabaseConfigStatus();
  assert.equal(emptyStatus.configured, false);
  assert.equal(emptyStatus.hasServiceRole, false);
  assert.equal(emptyStatus.projectHost, null);

  process.env.SUPABASE_URL = 'https://ajjangola.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret-role-key-do-not-leak';

  const configuredStatus = getSupabaseConfigStatus();
  assert.equal(configuredStatus.configured, true);
  assert.equal(configuredStatus.hasServiceRole, true);
  assert.equal(configuredStatus.projectHost, 'ajjangola.supabase.co');
  assert.equal(JSON.stringify(configuredStatus).includes('secret-role-key'), false);

  if (prevUrl !== undefined) process.env.SUPABASE_URL = prevUrl;
  else delete process.env.SUPABASE_URL;
  if (prevService !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = prevService;
  else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (prevAnon !== undefined) process.env.SUPABASE_ANON_KEY = prevAnon;
  else delete process.env.SUPABASE_ANON_KEY;
});

test('sanitizeUserRowForSupabase and stripSensitiveColumns remove password hashes and encrypted BI numbers', () => {
  const safeUser = sanitizeUserRowForSupabase({
    id: 1,
    email: 'associacaodejovensjuristas@gmail.com',
    full_name: 'Presidente Nacional',
    role_code: 'PRESIDENTE',
    password_hash: '$2b$10$secret',
    mfa_pending_code_hash: 'hash123',
  });
  assert.equal('password_hash' in safeUser, false);
  assert.equal('mfa_pending_code_hash' in safeUser, false);
  assert.equal(safeUser.email, 'associacaodejovensjuristas@gmail.com');

  const safeMember = stripSensitiveColumns('members', {
    id: 1,
    member_code: 'AJJ-LUA-2026-00001',
    id_number_encrypted: 'cipher-payload',
    full_name: 'Ana Catarina',
  });
  assert.equal('id_number_encrypted' in safeMember, false);
  assert.equal(safeMember.member_code, 'AJJ-LUA-2026-00001');
});

test('syncSingleEntityToSupabase and testSupabaseConnection fail gracefully without throwing when unconfigured', async () => {
  const prevUrl = process.env.SUPABASE_URL;
  const prevService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  const conn = await testSupabaseConnection();
  assert.equal(conn.connected, false);
  assert.ok(conn.error);

  const syncRes = await syncSingleEntityToSupabase('publications', [{ id: 1, title: 'Teste' }]);
  assert.equal(syncRes.ok, false);
  assert.equal(syncRes.skipped, true);

  if (prevUrl !== undefined) process.env.SUPABASE_URL = prevUrl;
  if (prevService !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = prevService;
});

test('supabase/schema.sql defines core relational tables, indexes, storage bucket, and RLS policies', () => {
  const sql = fs.readFileSync(path.join(process.cwd(), 'supabase', 'schema.sql'), 'utf8');
  for (const requiredTable of [
    'public.system_settings',
    'public.provinces',
    'public.members',
    'public.applications',
    'public.appointments',
    'public.publications',
    'public.activities',
    'public.sms_logs',
    'public.audit_logs',
  ]) {
    assert.ok(sql.includes(requiredTable), `Missing table ${requiredTable} in supabase/schema.sql`);
  }
  assert.ok(sql.includes('enable row level security'));
  assert.ok(sql.includes('sgajj-documentos'));
});
