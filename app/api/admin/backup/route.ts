import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { getDb, writeAuditLog } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET() {
  const { user, errorResponse } = await requireAuth('MANAGE_BACKUPS');
  if (errorResponse || !user) return errorResponse!;

  const db = getDb();
  const backupDir = path.join(process.cwd(), 'data', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `sgajj-backup-${stamp}.db`);
  db.exec(`VACUUM INTO '${backupFile.replace(/'/g, "''")}'`);
  db.prepare(`UPDATE system_settings SET last_backup_at = datetime('now') WHERE id = 1`).run();

  writeAuditLog(db, {
    userId: user.id,
    userName: user.full_name,
    roleCode: user.role_code,
    action: 'BACKUP_BASE_DADOS_GERADO',
    entityType: 'system_backup',
    details: { file: path.basename(backupFile) },
  });

  const buffer = fs.readFileSync(backupFile);
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="sgajj-backup-${stamp}.db"`,
    },
  });
}
