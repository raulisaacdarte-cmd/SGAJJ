import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { hashToken } from '@/lib/crypto';
import { SESSION_COOKIE_NAME } from '@/lib/auth';

export async function POST() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (rawToken) {
    const db = getDb();
    db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(hashToken(rawToken));
  }
  const response = NextResponse.json({ success: true });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
