import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type Database from 'better-sqlite3';

export interface SupabaseConfigStatus {
  configured: boolean;
  hasServiceRole: boolean;
  hasAnonKey: boolean;
  projectHost: string | null;
  storageBucket: string;
}

export interface SupabaseConnectionResult {
  connected: boolean;
  schemaReady: boolean;
  error: string | null;
  remoteCounts: Record<string, number>;
}

export interface SupabaseSyncSummary {
  ok: boolean;
  totalRowsSynced: number;
  syncedTables: Array<{ table: string; count: number; ok: boolean; error?: string }>;
  error?: string;
}

let cachedAdminClient: { key: string; client: SupabaseClient } | null = null;

export function getSupabaseEnv() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const storageBucket = (process.env.SUPABASE_STORAGE_BUCKET || 'sgajj-documentos').trim() || 'sgajj-documentos';
  return { url, anonKey, serviceRoleKey, storageBucket };
}

export function getSupabaseConfigStatus(): SupabaseConfigStatus {
  const { url, anonKey, serviceRoleKey, storageBucket } = getSupabaseEnv();
  let projectHost: string | null = null;
  if (url) {
    try {
      projectHost = new URL(url).host;
    } catch {
      projectHost = null;
    }
  }
  const hasServiceRole = Boolean(serviceRoleKey);
  const hasAnonKey = Boolean(anonKey);
  return {
    configured: Boolean(projectHost && (hasServiceRole || hasAnonKey)),
    hasServiceRole,
    hasAnonKey,
    projectHost,
    storageBucket,
  };
}

export function getSupabaseAdminClient(): SupabaseClient | null {
  const { url, anonKey, serviceRoleKey } = getSupabaseEnv();
  const activeKey = serviceRoleKey || anonKey;
  if (!url || !activeKey) return null;

  try {
    new URL(url);
  } catch {
    return null;
  }

  const cacheKey = `${url}::${activeKey.slice(0, 12)}`;
  if (cachedAdminClient && cachedAdminClient.key === cacheKey) {
    return cachedAdminClient.client;
  }

  const client = createClient(url, activeKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  cachedAdminClient = { key: cacheKey, client };
  return client;
}

export function sanitizeUserRowForSupabase(row: Record<string, unknown>): Record<string, unknown> {
  const safeKeys = [
    'id',
    'email',
    'phone',
    'full_name',
    'role_code',
    'province_id',
    'department_id',
    'member_id',
    'photo_path',
    'activation_pending',
    'mfa_enabled',
    'is_active',
    'consent_lgpd',
    'last_login_at',
    'created_at',
  ] as const;

  const out: Record<string, unknown> = {};
  for (const key of safeKeys) {
    if (key in row) {
      out[key] = row[key];
    }
  }
  return out;
}

export function stripSensitiveColumns(
  table: string,
  row: Record<string, unknown>
): Record<string, unknown> {
  if (table === 'users') {
    return sanitizeUserRowForSupabase(row);
  }
  if (table === 'members' || table === 'applications') {
    const copy = { ...row };
    delete copy.id_number_encrypted;
    return copy;
  }
  return { ...row };
}

export async function testSupabaseConnection(): Promise<SupabaseConnectionResult> {
  const client = getSupabaseAdminClient();
  if (!client) {
    return {
      connected: false,
      schemaReady: false,
      error: 'Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY ainda não configuradas.',
      remoteCounts: {},
    };
  }

  const tablesToProbe = ['provinces', 'members', 'applications', 'publications', 'activities', 'sms_logs'];
  const remoteCounts: Record<string, number> = {};
  let schemaReady = true;
  let firstError: string | null = null;

  for (const table of tablesToProbe) {
    try {
      const { count, error } = await client.from(table).select('*', { count: 'exact', head: true });
      if (error) {
        schemaReady = false;
        if (!firstError) firstError = error.message;
      } else {
        remoteCounts[table] = count ?? 0;
      }
    } catch (err) {
      schemaReady = false;
      if (!firstError) firstError = err instanceof Error ? err.message : 'Erro ao consultar tabela no Supabase.';
    }
  }

  return {
    connected: schemaReady || Object.keys(remoteCounts).length > 0,
    schemaReady,
    error: firstError,
    remoteCounts,
  };
}

export async function syncSingleEntityToSupabase(
  table: string,
  rows: Array<Record<string, unknown>>,
  onConflict = 'id'
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  if (!rows.length) return { ok: true, skipped: true };
  const status = getSupabaseConfigStatus();
  if (!status.configured || !status.hasServiceRole) {
    return { ok: false, skipped: true };
  }

  const client = getSupabaseAdminClient();
  if (!client) return { ok: false, skipped: true };

  try {
    const sanitized = rows.map((r) => stripSensitiveColumns(table, r));
    const { error } = await client.from(table).upsert(sanitized, { onConflict });
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Falha na sincronização com o Supabase.' };
  }
}

export async function uploadFileToSupabaseStorage(params: {
  storagePath: string;
  buffer: Buffer;
  contentType: string;
}): Promise<{ ok: boolean; skipped?: boolean; path?: string; error?: string }> {
  const status = getSupabaseConfigStatus();
  if (!status.configured || !status.hasServiceRole) {
    return { ok: false, skipped: true };
  }

  const client = getSupabaseAdminClient();
  if (!client) return { ok: false, skipped: true };

  try {
    const cleanPath = params.storagePath.replace(/^\/+/, '');
    const { data, error } = await client.storage
      .from(status.storageBucket)
      .upload(cleanPath, params.buffer, {
        contentType: params.contentType || 'application/octet-stream',
        upsert: true,
      });
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true, path: data?.path || cleanPath };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erro ao enviar ficheiro para o Supabase Storage.' };
  }
}

const SYNC_PLAN: Array<{ table: string; onConflict: string; orderBy?: string }> = [
  { table: 'system_settings', onConflict: 'id' },
  { table: 'provinces', onConflict: 'id', orderBy: 'id ASC' },
  { table: 'municipalities', onConflict: 'id', orderBy: 'id ASC' },
  { table: 'departments', onConflict: 'id', orderBy: 'id ASC' },
  { table: 'roles', onConflict: 'code', orderBy: 'rank ASC' },
  { table: 'member_categories', onConflict: 'id', orderBy: 'id ASC' },
  { table: 'members', onConflict: 'id', orderBy: 'id ASC' },
  { table: 'users', onConflict: 'id', orderBy: 'id ASC' },
  { table: 'coordinations', onConflict: 'id', orderBy: 'id ASC' },
  { table: 'applications', onConflict: 'id', orderBy: 'id ASC' },
  { table: 'appointments', onConflict: 'id', orderBy: 'id ASC' },
  { table: 'digital_cards', onConflict: 'id', orderBy: 'id ASC' },
  { table: 'financial_accounts', onConflict: 'id', orderBy: 'id ASC' },
  { table: 'quotas', onConflict: 'id', orderBy: 'id ASC' },
  { table: 'financial_transactions', onConflict: 'id', orderBy: 'id ASC' },
  { table: 'documents', onConflict: 'id', orderBy: 'id ASC' },
  { table: 'activities', onConflict: 'id', orderBy: 'id ASC' },
  { table: 'publications', onConflict: 'id', orderBy: 'id ASC' },
  { table: 'legal_office_items', onConflict: 'id', orderBy: 'id ASC' },
  { table: 'ethics_cases', onConflict: 'id', orderBy: 'id ASC' },
  { table: 'sms_logs', onConflict: 'id', orderBy: 'id ASC' },
  { table: 'audit_logs', onConflict: 'id', orderBy: 'id ASC' },
];

export async function syncFullCatalogToSupabase(db: Database.Database): Promise<SupabaseSyncSummary> {
  const status = getSupabaseConfigStatus();
  if (!status.configured || !status.hasServiceRole) {
    return {
      ok: false,
      totalRowsSynced: 0,
      syncedTables: [],
      error: 'Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nos Segredos para sincronizar.',
    };
  }

  const client = getSupabaseAdminClient();
  if (!client) {
    return {
      ok: false,
      totalRowsSynced: 0,
      syncedTables: [],
      error: 'Cliente Supabase indisponível.',
    };
  }

  const syncedTables: Array<{ table: string; count: number; ok: boolean; error?: string }> = [];
  let totalRowsSynced = 0;

  for (const step of SYNC_PLAN) {
    try {
      const orderSql = step.orderBy ? ` ORDER BY ${step.orderBy}` : '';
      const rawRows = db.prepare(`SELECT * FROM ${step.table}${orderSql}`).all() as Array<Record<string, unknown>>;
      if (rawRows.length === 0) {
        syncedTables.push({ table: step.table, count: 0, ok: true });
        continue;
      }

      const sanitized = rawRows.map((row) => stripSensitiveColumns(step.table, row));
      const { error } = await client.from(step.table).upsert(sanitized, { onConflict: step.onConflict });
      if (error) {
        syncedTables.push({ table: step.table, count: 0, ok: false, error: error.message });
      } else {
        totalRowsSynced += sanitized.length;
        syncedTables.push({ table: step.table, count: sanitized.length, ok: true });
      }
    } catch (err) {
      syncedTables.push({
        table: step.table,
        count: 0,
        ok: false,
        error: err instanceof Error ? err.message : 'Erro inesperado na tabela.',
      });
    }
  }

  const hasErrors = syncedTables.some((t) => !t.ok);
  return {
    ok: !hasErrors,
    totalRowsSynced,
    syncedTables,
    error: hasErrors ? 'Algumas tabelas requerem execução prévia de supabase/schema.sql no Supabase.' : undefined,
  };
}
