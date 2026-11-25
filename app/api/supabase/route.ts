import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '@/lib/auth';
import { getDb, writeAuditLog } from '@/lib/db';
import { isPresident } from '@/lib/domain';
import {
  getSupabaseConfigStatus,
  syncFullCatalogToSupabase,
  testSupabaseConnection,
} from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse || !user) return errorResponse!;

  if (!isPresident(user.role_code)) {
    return NextResponse.json(
      { error: 'Apenas a Presidência Nacional pode gerir a integração Supabase.' },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  if (searchParams.get('download') === 'schema') {
    const schemaPath = path.join(process.cwd(), 'supabase', 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
      return NextResponse.json({ error: 'Ficheiro supabase/schema.sql não encontrado.' }, { status: 404 });
    }
    const sqlText = fs.readFileSync(schemaPath, 'utf8');
    return new NextResponse(sqlText, {
      status: 200,
      headers: {
        'Content-Type': 'application/sql; charset=utf-8',
        'Content-Disposition': 'attachment; filename="sgajj-supabase-schema.sql"',
      },
    });
  }

  const status = getSupabaseConfigStatus();
  const connection = status.configured
    ? await testSupabaseConnection()
    : {
        connected: false,
        schemaReady: false,
        error: null,
        remoteCounts: {},
      };

  return NextResponse.json({
    status,
    connection,
  });
}

export async function POST(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse || !user) return errorResponse!;

  if (!isPresident(user.role_code)) {
    return NextResponse.json(
      { error: 'Apenas a Presidência Nacional pode sincronizar com o Supabase.' },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  const action = body.action || 'TEST_CONNECTION';

  if (action === 'TEST_CONNECTION') {
    const status = getSupabaseConfigStatus();
    const connection = await testSupabaseConnection();
    return NextResponse.json({ status, connection });
  }

  if (action === 'SYNC_ALL') {
    const db = getDb();
    const summary = await syncFullCatalogToSupabase(db);
    writeAuditLog(db, {
      userId: user.id,
      userName: user.full_name,
      roleCode: user.role_code,
      action: 'SYNC_SUPABASE_FULL',
      entityType: 'SYSTEM',
      entityId: 'supabase',
      details: {
        ok: summary.ok,
        totalRowsSynced: summary.totalRowsSynced,
      },
    });
    return NextResponse.json(summary, { status: summary.ok ? 200 : 400 });
  }

  return NextResponse.json({ error: 'Ação Supabase não suportada.' }, { status: 400 });
}
