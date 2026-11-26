import { NextRequest, NextResponse } from 'next/server';
import { getDb, writeAuditLog } from '@/lib/db';
import { verifyPassword, generateSixDigitCode, hashToken } from '@/lib/crypto';
import { createUserSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { computeLockoutState, getDefaultPanelTab, normalizePhoneDigits } from '@/lib/domain';
import { escapeHtml, hasExternalEmailGatewayConfigured, sendAndLogEmail } from '@/lib/email';

interface LoginUserRow {
  id: number;
  email: string;
  phone: string;
  password_hash: string;
  full_name: string;
  role_code: string;
  role_name: string;
  province_id: number | null;
  member_code: string | null;
  photo_path: string | null;
  activation_pending: number;
  failed_login_attempts: number;
  locked_until: string | null;
  mfa_enabled: number;
  mfa_pending_code_hash: string | null;
  mfa_pending_expires_at: string | null;
  is_active: number;
}

export async function POST(req: NextRequest) {
  const { identifier, email, password, mfaCode, trustedDevice } = await req.json();
  const rawIdentifier = String(identifier || email || '').trim();
  if (!rawIdentifier || !password) {
    return NextResponse.json(
      { error: 'Código de associado, telefone ou e-mail e palavra-passe são obrigatórios.' },
      { status: 400 }
    );
  }

  const db = getDb();
  const baseQuery = `
    SELECT u.*, r.name as role_name, m.member_code, COALESCE(u.photo_path, m.photo_path) as photo_path
    FROM users u
    JOIN roles r ON r.code = u.role_code
    LEFT JOIN members m ON m.id = u.member_id
  `;

  let user = db
    .prepare(`${baseQuery} WHERE LOWER(u.email) = LOWER(?) OR UPPER(m.member_code) = UPPER(?) LIMIT 1`)
    .get(rawIdentifier, rawIdentifier) as LoginUserRow | undefined;

  if (!user) {
    const inputDigits = normalizePhoneDigits(rawIdentifier);
    if (inputDigits.length >= 9) {
      const candidates = db.prepare(`${baseQuery} WHERE u.phone != ''`).all() as LoginUserRow[];
      user = candidates.find((c) => {
        const storedDigits = normalizePhoneDigits(c.phone);
        if (!storedDigits) return false;
        return (
          storedDigits === inputDigits ||
          storedDigits.endsWith(inputDigits) ||
          inputDigits.endsWith(storedDigits)
        );
      });
    }
  }

  if (!user) {
    return NextResponse.json({ error: 'Credenciais inválidas.' }, { status: 401 });
  }

  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    const minsLeft = Math.max(1, Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000));
    writeAuditLog(db, {
      userId: user.id,
      userName: user.full_name,
      roleCode: user.role_code,
      action: 'LOGIN_CONTA_BLOQUEADA',
      entityType: 'user',
      entityId: user.id,
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
    });
    return NextResponse.json(
      { error: `Conta temporariamente bloqueada após tentativas falhadas. Tente novamente dentro de ${minsLeft} minuto(s).` },
      { status: 423 }
    );
  }

  if (user.activation_pending === 1) {
    return NextResponse.json(
      {
        error:
          'A sua conta aguarda ativação inicial. Utilize o link de ativação enviado para o seu e-mail ou SMS para definir a sua palavra-passe pessoal.',
      },
      { status: 403 }
    );
  }

  if (!verifyPassword(password, user.password_hash)) {
    const lock = computeLockoutState(user.failed_login_attempts || 0, Date.now());
    db.prepare(`UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?`).run(
      lock.nextAttempts,
      lock.lockedUntilIso,
      user.id
    );
    writeAuditLog(db, {
      userId: user.id,
      userName: user.full_name,
      roleCode: user.role_code,
      action: 'LOGIN_FALHA_SENHA',
      entityType: 'user',
      entityId: user.id,
      details: { attempts: lock.nextAttempts, locked: lock.isLocked },
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
    });
    return NextResponse.json(
      {
        error: lock.isLocked
          ? 'Demasiadas tentativas incorretas. Conta bloqueada por 15 minutos por segurança.'
          : 'Credenciais inválidas.',
      },
      { status: lock.isLocked ? 423 : 401 }
    );
  }

  if (!user.is_active) {
    return NextResponse.json({ error: 'Conta suspensa ou desativada. Contacte a Direção Central.' }, { status: 403 });
  }

  // MFA challenge for privileged profiles with mfa_enabled = 1
  if (user.mfa_enabled === 1) {
    if (!mfaCode) {
      const code = generateSixDigitCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      db.prepare(`
        UPDATE users SET mfa_pending_code_hash = ?, mfa_pending_expires_at = ? WHERE id = ?
      `).run(hashToken(code), expiresAt, user.id);

      await sendAndLogEmail(db, {
        recipientName: user.full_name,
        recipientEmail: user.email,
        subject: 'SGAJJ — Código MFA de Acesso Privilegiado',
        textBody: `Prezado(a) ${user.full_name},\n\nO seu código MFA de autenticação (válido por 10 minutos) é: ${code}\n\nAssociação de Jovens Juristas (AJJ)`,
        htmlBody: `<p>Prezado(a) <strong>${escapeHtml(user.full_name)}</strong>,</p><p>Código MFA para acesso privilegiado ao SGAJJ (válido por 10 minutos):</p><p style="font-size:22px;font-weight:700;letter-spacing:4px;font-family:monospace;color:#0b1f3a;">${escapeHtml(code)}</p>`,
        category: 'MFA_LOGIN',
        relatedEntity: 'user',
        relatedId: String(user.id),
      });

      writeAuditLog(db, {
        userId: user.id,
        userName: user.full_name,
        roleCode: user.role_code,
        action: 'MFA_DESAFIO_EMITIDO',
        entityType: 'user',
        entityId: user.id,
      });

      return NextResponse.json({
        mfaRequired: true,
        message: 'Autenticação multifator exigida para este perfil privilegiado. Introduza o código de 6 dígitos.',
        demoMfaHint: hasExternalEmailGatewayConfigured() ? undefined : code,
      });
    }

    const validHash = user.mfa_pending_code_hash === hashToken(String(mfaCode).trim());
    const notExpired = user.mfa_pending_expires_at && new Date(user.mfa_pending_expires_at).getTime() > Date.now();
    if (!validHash || !notExpired) {
      return NextResponse.json({ error: 'Código MFA inválido ou expirado.' }, { status: 401 });
    }

    db.prepare(`UPDATE users SET mfa_pending_code_hash = NULL, mfa_pending_expires_at = NULL WHERE id = ?`).run(user.id);
  }

  const { rawToken, expiresAt } = createUserSession(
    user.id,
    req.headers.get('user-agent') || '',
    req.headers.get('x-forwarded-for') || '127.0.0.1',
    Boolean(trustedDevice)
  );

  const defaultTab = getDefaultPanelTab(user.role_code);

  writeAuditLog(db, {
    userId: user.id,
    userName: user.full_name,
    roleCode: user.role_code,
    action: 'INICIO_SESSAO',
    entityType: 'user',
    entityId: user.id,
    details: { trustedDevice: Boolean(trustedDevice), defaultTab },
    ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
  });

  const response = NextResponse.json({
    success: true,
    defaultTab,
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role_code: user.role_code,
      role_name: user.role_name,
      member_code: user.member_code,
    },
  });

  response.cookies.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires: new Date(expiresAt),
  });

  return response;
}
