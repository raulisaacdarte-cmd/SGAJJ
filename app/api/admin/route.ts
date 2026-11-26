import { NextRequest, NextResponse } from 'next/server';
import { getDb, writeAuditLog, createActivationToken, createNotification } from '@/lib/db';
import { generateToken, hashPassword } from '@/lib/crypto';
import { requireAuth, revokeAllUserSessions } from '@/lib/auth';
import { buildActivationNotificationTemplates, isCentralDirectorate, isPresident, isProvincialRole } from '@/lib/domain';

export async function GET() {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse || !user) return errorResponse!;

  const db = getDb();
  const isNat = isCentralDirectorate(user.role_code);
  const isProv = isProvincialRole(user.role_code);

  const totalMembers = (db.prepare(
    isNat ? `SELECT COUNT(*) as c FROM members` : `SELECT COUNT(*) as c FROM members WHERE province_id = ?`
  ).get(...(isNat ? [] : [user.province_id || -1])) as { c: number }).c;

  const activeMembers = (db.prepare(
    isNat
      ? `SELECT COUNT(*) as c FROM members WHERE status = 'ATIVO'`
      : `SELECT COUNT(*) as c FROM members WHERE status = 'ATIVO' AND province_id = ?`
  ).get(...(isNat ? [] : [user.province_id || -1])) as { c: number }).c;

  const suspendedMembers = (db.prepare(
    isNat
      ? `SELECT COUNT(*) as c FROM members WHERE status = 'SUSPENSO'`
      : `SELECT COUNT(*) as c FROM members WHERE status = 'SUSPENSO' AND province_id = ?`
  ).get(...(isNat ? [] : [user.province_id || -1])) as { c: number }).c;

  const pendingApplications = (db.prepare(
    isNat
      ? `SELECT COUNT(*) as c FROM applications WHERE status IN ('PENDENTE', 'EM_ANALISE', 'AGUARDA_DOCUMENTACAO', 'AGUARDA_VALIDACAO')`
      : `SELECT COUNT(*) as c FROM applications WHERE province_id = ? AND status IN ('PENDENTE', 'EM_ANALISE', 'AGUARDA_DOCUMENTACAO', 'AGUARDA_VALIDACAO')`
  ).get(...(isNat ? [] : [user.province_id || -1])) as { c: number }).c;

  const activeCoordinations = (db.prepare(`SELECT COUNT(*) as c FROM coordinations WHERE status = 'ATIVA'`).get() as {
    c: number;
  }).c;

  const totalRevenue = (db.prepare(
    isNat
      ? `SELECT COALESCE(SUM(amount_aoa), 0) as s FROM financial_transactions WHERE status = 'APROVADO' AND type != 'DESPESA'`
      : `SELECT COALESCE(SUM(amount_aoa), 0) as s FROM financial_transactions WHERE scope = 'PROVINCIAL' AND province_id = ? AND status = 'APROVADO' AND type != 'DESPESA'`
  ).get(...(isNat ? [] : [user.province_id || -1])) as { s: number }).s;

  const totalExpenses = (db.prepare(
    isNat
      ? `SELECT COALESCE(SUM(amount_aoa), 0) as s FROM financial_transactions WHERE status = 'APROVADO' AND type = 'DESPESA'`
      : `SELECT COALESCE(SUM(amount_aoa), 0) as s FROM financial_transactions WHERE scope = 'PROVINCIAL' AND province_id = ? AND status = 'APROVADO' AND type = 'DESPESA'`
  ).get(...(isNat ? [] : [user.province_id || -1])) as { s: number }).s;

  const pendingExpenses = (db.prepare(
    `SELECT COUNT(*) as c FROM financial_transactions WHERE status = 'PENDENTE_APROVACAO'`
  ).get() as { c: number }).c;

  const activitiesCount = (db.prepare(
    isNat
      ? `SELECT COUNT(*) as c FROM activities`
      : `SELECT COUNT(*) as c FROM activities WHERE province_id IS NULL OR province_id = ?`
  ).get(...(isNat ? [] : [user.province_id || -1])) as { c: number }).c;

  const appointmentsCount = (db.prepare(
    isNat
      ? `SELECT COUNT(*) as c FROM appointments WHERE status = 'APROVADA'`
      : `SELECT COUNT(*) as c FROM appointments WHERE status = 'APROVADA' AND province_id = ?`
  ).get(...(isNat ? [] : [user.province_id || -1])) as { c: number }).c;

  const pendingValidations = (db.prepare(
    isNat
      ? `SELECT COUNT(*) as c FROM appointments WHERE status = 'AGUARDA_VALIDACAO'`
      : `SELECT COUNT(*) as c FROM appointments WHERE status = 'AGUARDA_VALIDACAO' AND province_id = ?`
  ).get(...(isNat ? [] : [user.province_id || -1])) as { c: number }).c;

  const pendingReports = (db.prepare(
    isNat
      ? `SELECT COUNT(*) as c FROM activities WHERE approval_status = 'APROVADA' AND (final_report IS NULL OR final_report = '')`
      : `SELECT COUNT(*) as c FROM activities WHERE province_id = ? AND approval_status = 'APROVADA' AND (final_report IS NULL OR final_report = '')`
  ).get(...(isNat ? [] : [user.province_id || -1])) as { c: number }).c;

  const growthByProvince = db
    .prepare(
      `
    SELECT p.name, p.code, COUNT(m.id) as members_count, c.status as coordination_status
    FROM provinces p
    LEFT JOIN members m ON m.province_id = p.id
    LEFT JOIN coordinations c ON c.province_id = p.id
    WHERE p.is_active = 1
    GROUP BY p.id
    ORDER BY members_count DESC, p.name ASC
  `
    )
    .all();

  const directorateRoster = isNat
    ? db
        .prepare(
          `
        SELECT r.code as role_code, r.name as role_name, r.rank,
               u.id as user_id, u.full_name, u.email, COALESCE(u.photo_path, m.photo_path) as photo_path,
               u.is_active, m.member_code
        FROM roles r
        LEFT JOIN users u ON u.role_code = r.code AND u.is_active = 1
        LEFT JOIN members m ON m.id = u.member_id
        WHERE r.scope = 'NATIONAL'
        ORDER BY r.rank ASC
      `
        )
        .all()
    : [];

  let provincialDashboard = null;
  if (isProv && user.province_id) {
    const coordination = db
      .prepare(
        `
      SELECT c.*, p.name as province_name, p.code as province_code,
             u.full_name as coordinator_name, u.email as coordinator_email, u.phone as coordinator_phone,
             COALESCE(u.photo_path, m.photo_path) as coordinator_photo,
             m.member_code as coordinator_member_code
      FROM coordinations c
      JOIN provinces p ON p.id = c.province_id
      LEFT JOIN users u ON u.id = c.coordinator_user_id
      LEFT JOIN members m ON m.id = c.coordinator_member_id
      WHERE c.province_id = ?
    `
      )
      .get(user.province_id);

    const team = db
      .prepare(
        `
      SELECT r.code as role_code, r.name as role_name, r.rank,
             u.id as user_id, u.full_name, u.email, u.phone,
             COALESCE(u.photo_path, m.photo_path) as photo_path,
             m.member_code, u.is_active
      FROM roles r
      LEFT JOIN users u ON u.role_code = r.code AND u.province_id = ? AND u.is_active = 1
      LEFT JOIN members m ON m.id = u.member_id
      WHERE r.scope = 'PROVINCIAL'
      ORDER BY r.rank ASC
    `
      )
      .all(user.province_id);

    const documentsCount = (db
      .prepare(`SELECT COUNT(*) as c FROM documents WHERE province_id = ? OR access_level IN ('PUBLICO', 'ASSOCIADOS', 'COORDENACAO')`)
      .get(user.province_id) as { c: number }).c;

    const communiquesCount = (db
      .prepare(`SELECT COUNT(*) as c FROM messages WHERE target_scope IN ('TODOS_ASSOCIADOS', 'COORDENADORES_PROVINCIAIS') OR target_province_id = ?`)
      .get(user.province_id) as { c: number }).c;

    provincialDashboard = {
      coordination,
      team,
      documentsCount,
      communiquesCount,
    };
  }

  const users = isPresident(user.role_code)
    ? db
        .prepare(
          `
        SELECT u.id, u.email, u.phone, u.full_name, u.role_code, u.province_id, u.department_id,
               u.mfa_enabled, u.is_active, u.activation_pending, u.last_login_at, u.created_at,
               COALESCE(u.photo_path, m.photo_path) as photo_path,
               m.member_code,
               r.name as role_name, p.name as province_name, d.name as department_name,
               (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id) as active_sessions_count
        FROM users u
        JOIN roles r ON r.code = u.role_code
        LEFT JOIN provinces p ON p.id = u.province_id
        LEFT JOIN departments d ON d.id = u.department_id
        LEFT JOIN members m ON m.id = u.member_id
        ORDER BY r.rank ASC, u.full_name ASC
      `
        )
        .all()
    : [];

  const auditLogs = isCentralDirectorate(user.role_code)
    ? db.prepare(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT 120`).all()
    : [];

  const settings = db.prepare(`SELECT * FROM system_settings WHERE id = 1`).get();

  return NextResponse.json({
    kpis: {
      totalMembers,
      activeMembers,
      suspendedMembers,
      pendingApplications,
      activeCoordinations,
      totalRevenue,
      totalExpenses,
      pendingExpenses,
      activitiesCount,
      appointmentsCount,
      pendingValidations,
      pendingReports,
    },
    growthByProvince,
    directorateRoster,
    provincialDashboard,
    users,
    auditLogs,
    settings,
  });
}

export async function POST(req: NextRequest) {
  const { user, errorResponse } = await requireAuth('ADMIN_FULL');
  if (errorResponse || !user) return errorResponse!;

  const body = await req.json();
  const db = getDb();

  if (body.action === 'UPDATE_MY_PROFILE') {
    const { full_name, email, phone, photo_path, new_password } = body as {
      full_name?: string;
      email?: string;
      phone?: string;
      photo_path?: string | null;
      new_password?: string;
    };

    if (!full_name?.trim() || !email?.trim()) {
      return NextResponse.json({ error: 'Nome completo e e-mail são obrigatórios.' }, { status: 400 });
    }
    if (new_password && String(new_password).length < 8) {
      return NextResponse.json(
        { error: 'A nova palavra-passe deve conter pelo menos 8 caracteres.' },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const conflict = db
      .prepare(`SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ?`)
      .get(cleanEmail, user.id);
    if (conflict) {
      return NextResponse.json({ error: 'Este e-mail já está atribuído a outra conta.' }, { status: 409 });
    }

    db.transaction(() => {
      db.prepare(`
        UPDATE users
        SET full_name = ?,
            email = ?,
            phone = ?,
            photo_path = COALESCE(?, photo_path),
            password_hash = COALESCE(?, password_hash)
        WHERE id = ?
      `).run(
        full_name.trim(),
        cleanEmail,
        phone?.trim() || '',
        photo_path || null,
        new_password ? hashPassword(String(new_password)) : null,
        user.id
      );

      if (user.member_id) {
        db.prepare(`
          UPDATE members
          SET full_name = ?,
              email = ?,
              phone = ?,
              photo_path = COALESCE(?, photo_path),
              updated_at = datetime('now')
          WHERE id = ?
        `).run(full_name.trim(), cleanEmail, phone?.trim() || '', photo_path || null, user.member_id);
      }

      writeAuditLog(db, {
        userId: user.id,
        userName: full_name.trim(),
        roleCode: user.role_code,
        action: 'PERFIL_PRESIDENCIAL_ATUALIZADO',
        entityType: 'user',
        entityId: user.id,
        details: {
          email: cleanEmail,
          passwordChanged: Boolean(new_password),
        },
      });
    })();

    return NextResponse.json({ success: true });
  }

  if (body.action === 'CREATE_USER') {
    const { full_name, email, phone, password, role_code, province_id, department_id, mfa_enabled, photo_path, send_activation_link } = body;
    if (!full_name?.trim() || !email?.trim() || !role_code) {
      return NextResponse.json({ error: 'Nome, e-mail e cargo são obrigatórios.' }, { status: 400 });
    }
    if (!send_activation_link && (!password || String(password).length < 6)) {
      return NextResponse.json({ error: 'Defina uma palavra-passe (mín. 6 caracteres) ou envie link de ativação.' }, { status: 400 });
    }
    const cleanEmail = email.trim().toLowerCase();
    const existing = db.prepare(`SELECT id FROM users WHERE LOWER(email) = LOWER(?)`).get(cleanEmail);
    if (existing) {
      return NextResponse.json({ error: 'Já existe um utilizador com este e-mail.' }, { status: 409 });
    }

    const usesActivation = Boolean(send_activation_link) || !password;
    const secretHash = hashPassword(usesActivation ? generateToken(24) : String(password));
    const baseUrl = process.env.APP_URL?.replace(/\/$/, '') || '';

    const created = db.transaction(() => {
      const res = db
        .prepare(
          `
        INSERT INTO users (
          email, phone, password_hash, full_name, role_code, province_id, department_id,
          photo_path, activation_pending, mfa_enabled, is_active, consent_lgpd
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
      `
        )
        .run(
          cleanEmail,
          phone?.trim() || '',
          secretHash,
          full_name.trim(),
          role_code,
          province_id ? Number(province_id) : null,
          department_id ? Number(department_id) : null,
          photo_path || null,
          usesActivation ? 1 : 0,
          mfa_enabled ? 1 : 0
        );

      const newUserId = Number(res.lastInsertRowid);
      let activationUrl: string | undefined;

      if (usesActivation) {
        const { rawToken } = createActivationToken(db, newUserId, 'ACTIVATE', 48);
        activationUrl = `${baseUrl}/ativar?token=${rawToken}`;
        const templates = buildActivationNotificationTemplates({
          fullName: full_name.trim(),
          memberCode: 'CONTA-INSTITUCIONAL',
          activationUrl,
          kind: 'ADESAO',
        });
        createNotification(db, {
          userId: newUserId,
          category: 'SISTEMA',
          title: templates.emailSubject,
          message: templates.emailBody,
          linkUrl: `/ativar?token=${rawToken}`,
          channel: 'EMAIL',
        });
      }

      writeAuditLog(db, {
        userId: user.id,
        userName: user.full_name,
        roleCode: user.role_code,
        action: 'UTILIZADOR_CRIADO',
        entityType: 'user',
        entityId: newUserId,
        details: { email: cleanEmail, role_code, usesActivation },
        newState: { role_code, province_id: province_id || null, is_active: 1 },
      });

      return {
        id: newUserId,
        activationUrl: process.env.EMAIL_WEBHOOK_URL ? undefined : activationUrl,
      };
    })();

    return NextResponse.json({ success: true, ...created });
  }

  if (body.action === 'TOGGLE_USER') {
    const { target_user_id, is_active, role_code, mfa_enabled } = body;
    if (Number(target_user_id) === user.id && is_active === false) {
      return NextResponse.json({ error: 'Não pode desativar a sua própria conta presidencial.' }, { status: 400 });
    }
    const prev = db.prepare(`SELECT is_active, role_code, mfa_enabled FROM users WHERE id = ?`).get(Number(target_user_id)) as
      | { is_active: number; role_code: string; mfa_enabled: number }
      | undefined;

    db.prepare(
      `
      UPDATE users
      SET is_active = COALESCE(?, is_active),
          role_code = COALESCE(?, role_code),
          mfa_enabled = COALESCE(?, mfa_enabled)
      WHERE id = ?
    `
    ).run(
      is_active !== undefined ? (is_active ? 1 : 0) : null,
      role_code || null,
      mfa_enabled !== undefined ? (mfa_enabled ? 1 : 0) : null,
      Number(target_user_id)
    );

    if (is_active === false) {
      revokeAllUserSessions(Number(target_user_id));
    }

    writeAuditLog(db, {
      userId: user.id,
      userName: user.full_name,
      roleCode: user.role_code,
      action: 'PERMISSOES_UTILIZADOR_ATUALIZADAS',
      entityType: 'user',
      entityId: Number(target_user_id),
      details: { is_active, role_code, mfa_enabled },
      previousState: prev || {},
      newState: {
        is_active: is_active !== undefined ? (is_active ? 1 : 0) : prev?.is_active,
        role_code: role_code || prev?.role_code,
        mfa_enabled: mfa_enabled !== undefined ? (mfa_enabled ? 1 : 0) : prev?.mfa_enabled,
      },
    });

    return NextResponse.json({ success: true });
  }

  if (body.action === 'REVOKE_CREDENTIALS') {
    const { target_user_id } = body;
    if (!target_user_id || Number(target_user_id) === user.id) {
      return NextResponse.json({ error: 'Conta alvo inválida.' }, { status: 400 });
    }
    const targetId = Number(target_user_id);
    db.transaction(() => {
      db.prepare(`UPDATE users SET activation_pending = 1 WHERE id = ?`).run(targetId);
      revokeAllUserSessions(targetId);
      const { rawToken } = createActivationToken(db, targetId, 'ACTIVATE', 48);
      createNotification(db, {
        userId: targetId,
        category: 'SEGURANCA',
        title: 'Credenciais Revogadas — Reativação Necessária',
        message: `A Presidência revogou as sessões anteriores. Utilize o novo link seguro para redefinir o acesso: /ativar?token=${rawToken}`,
        linkUrl: `/ativar?token=${rawToken}`,
        channel: 'EMAIL',
      });
      writeAuditLog(db, {
        userId: user.id,
        userName: user.full_name,
        roleCode: user.role_code,
        action: 'CREDENCIAS_REVOGADAS_SESSOES_TERMINADAS',
        entityType: 'user',
        entityId: targetId,
      });
    })();
    return NextResponse.json({ success: true });
  }

  if (body.action === 'UPDATE_SETTINGS') {
    const { organization_name, nif, headquarters_address, contact_email, contact_phone, logo_path, quota_rules } = body;
    db.transaction(() => {
      db.prepare(
        `
        UPDATE system_settings
        SET organization_name = COALESCE(?, organization_name),
            nif = COALESCE(?, nif),
            headquarters_address = COALESCE(?, headquarters_address),
            contact_email = COALESCE(?, contact_email),
            contact_phone = COALESCE(?, contact_phone),
            logo_path = COALESCE(?, logo_path),
            updated_at = datetime('now')
        WHERE id = 1
      `
      ).run(
        organization_name?.trim() || null,
        nif ?? null,
        headquarters_address ?? null,
        contact_email ?? null,
        contact_phone ?? null,
        logo_path || null
      );

      if (Array.isArray(quota_rules)) {
        const upd = db.prepare(`UPDATE member_categories SET monthly_quota_aoa = ? WHERE id = ?`);
        for (const r of quota_rules) {
          upd.run(Number(r.monthly_quota_aoa) || 0, Number(r.id));
        }
      }

      writeAuditLog(db, {
        userId: user.id,
        userName: user.full_name,
        roleCode: user.role_code,
        action: 'CONFIGURACAO_SISTEMA_ATUALIZADA',
        entityType: 'system_settings',
        entityId: 1,
      });
    })();

    return NextResponse.json({ success: true });
  }

  if (body.action === 'ADD_DEPARTMENT') {
    const { code, name, description } = body;
    if (!code?.trim() || !name?.trim()) {
      return NextResponse.json({ error: 'Código e nome do departamento são obrigatórios.' }, { status: 400 });
    }
    db.prepare(`INSERT OR IGNORE INTO departments (code, name, description) VALUES (?, ?, ?)`).run(
      code.trim().toUpperCase().replace(/\s+/g, '_'),
      name.trim(),
      description?.trim() || ''
    );
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Ação administrativa desconhecida.' }, { status: 400 });
}
