import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = getDb();
  const settings = db.prepare(`SELECT * FROM system_settings WHERE id = 1`).get();
  const provinces = db.prepare(`SELECT id, code, name, is_active FROM provinces ORDER BY name ASC`).all();
  const municipalities = db.prepare(`SELECT id, province_id, name FROM municipalities ORDER BY name ASC`).all();
  const categories = db.prepare(`SELECT id, code, name, monthly_quota_aoa, description FROM member_categories ORDER BY id ASC`).all();
  const departments = db.prepare(`SELECT id, code, name, description FROM departments ORDER BY id ASC`).all();
  const roles = db.prepare(`SELECT code, name, scope, rank, department_code FROM roles ORDER BY rank ASC`).all();
  const coordinations = db.prepare(`
    SELECT c.province_id, c.status, c.activated_at, p.name as province_name, u.full_name as coordinator_name
    FROM coordinations c
    JOIN provinces p ON p.id = c.province_id
    LEFT JOIN users u ON u.id = c.coordinator_user_id
    ORDER BY p.name ASC
  `).all();

  const stats = {
    provincesCount: provinces.filter((p) => (p as { is_active: number }).is_active === 1).length,
    activeCoordinations: (db.prepare(`SELECT COUNT(*) as c FROM coordinations WHERE status = 'ATIVA'`).get() as { c: number }).c,
    publishedArticles: (db.prepare(`SELECT COUNT(*) as c FROM publications WHERE status = 'PUBLICADO'`).get() as { c: number }).c,
    activeMembers: (db.prepare(`SELECT COUNT(*) as c FROM members WHERE status = 'ATIVO'`).get() as { c: number }).c,
    upcomingActivities: (db.prepare(`SELECT COUNT(*) as c FROM activities WHERE approval_status = 'APROVADA'`).get() as { c: number }).c,
  };

  return NextResponse.json({
    settings,
    provinces,
    municipalities,
    categories,
    departments,
    roles,
    coordinations,
    stats,
  });
}
