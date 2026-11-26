import { NextRequest, NextResponse } from 'next/server';
import { getDb, writeAuditLog } from '@/lib/db';
import { generateSixDigitCode, hashPassword, hashToken } from '@/lib/crypto';
import { escapeHtml, hasExternalEmailGatewayConfigured, sendAndLogEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  const { action, email, code, newPassword } = await req.json();
  const db = getDb();

  if (action === 'REQUEST') {
    if (!email) {
      return NextResponse.json({ error: 'Indique o endereço eletrónico.' }, { status: 400 });
    }
    const cleanEmail = email.trim().toLowerCase();
    const user = db.prepare(`SELECT id, full_name, role_code FROM users WHERE LOWER(email) = LOWER(?)`).get(cleanEmail) as
      | { id: number; full_name: string; role_code: string }
      | undefined;

    if (!user) {
      return NextResponse.json({
        success: true,
        message: 'Se o endereço existir no sistema, foi emitido um código de recuperação.',
      });
    }

    const rawCode = generateSixDigitCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    db.prepare(`INSERT INTO password_resets (user_id, code_hash, expires_at) VALUES (?, ?, ?)`).run(
      user.id,
      hashToken(rawCode),
      expiresAt
    );

    const textBody =
      `Prezado(a) ${user.full_name},\n\n` +
      `Foi solicitado um código de recuperação de palavra-passe para a sua conta SGAJJ.\n` +
      `Código de verificação (válido por 15 minutos): ${rawCode}\n\n` +
      `Se não solicitou esta recuperação, ignore esta mensagem.\n` +
      `Associação de Jovens Juristas (AJJ) — Angola`;
    const htmlBody = `<p>Prezado(a) <strong>${escapeHtml(user.full_name)}</strong>,</p><p>Código de recuperação de acesso ao SGAJJ (válido por 15 minutos):</p><p style="font-size:22px;font-weight:700;letter-spacing:4px;font-family:monospace;color:#0b1f3a;">${escapeHtml(rawCode)}</p><p>Se não solicitou esta alteração, ignore esta mensagem.</p>`;

    await sendAndLogEmail(db, {
      recipientName: user.full_name,
      recipientEmail: cleanEmail,
      subject: 'SGAJJ — Código de Recuperação de Palavra-Passe',
      textBody,
      htmlBody,
      category: 'RECUPERACAO_SENHA',
      relatedEntity: 'user',
      relatedId: String(user.id),
    });

    writeAuditLog(db, {
      userId: user.id,
      userName: user.full_name,
      roleCode: user.role_code,
      action: 'PEDIDO_RECUPERACAO_SENHA',
      entityType: 'user',
      entityId: user.id,
    });

    return NextResponse.json({
      success: true,
      message: 'Código de recuperação emitido com validade de 15 minutos.',
      recoveryCodePreview: hasExternalEmailGatewayConfigured() ? undefined : rawCode,
    });
  }

  if (action === 'RESET') {
    if (!email || !code || !newPassword || newPassword.length < 6) {
      return NextResponse.json({ error: 'Preencha o e-mail, código e nova palavra-passe (mín. 6 caracteres).' }, { status: 400 });
    }
    const user = db.prepare(`SELECT id, full_name, role_code FROM users WHERE LOWER(email) = LOWER(?)`).get(email.trim()) as
      | { id: number; full_name: string; role_code: string }
      | undefined;
    if (!user) {
      return NextResponse.json({ error: 'Utilizador não encontrado.' }, { status: 404 });
    }

    const resetRow = db.prepare(`
      SELECT id, expires_at FROM password_resets
      WHERE user_id = ? AND code_hash = ? AND used_at IS NULL
      ORDER BY id DESC LIMIT 1
    `).get(user.id, hashToken(String(code).trim())) as { id: number; expires_at: string } | undefined;

    if (!resetRow || new Date(resetRow.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Código inválido ou expirado.' }, { status: 400 });
    }

    db.transaction(() => {
      db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(hashPassword(newPassword), user.id);
      db.prepare(`UPDATE password_resets SET used_at = datetime('now') WHERE id = ?`).run(resetRow.id);
      db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(user.id);
      writeAuditLog(db, {
        userId: user.id,
        userName: user.full_name,
        roleCode: user.role_code,
        action: 'REDEFINICAO_PALAVRA_PASSE',
        entityType: 'user',
        entityId: user.id,
      });
    })();

    return NextResponse.json({ success: true, message: 'Palavra-passe atualizada com segurança.' });
  }

  return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
}
