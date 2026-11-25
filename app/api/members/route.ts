import { NextRequest, NextResponse } from 'next/server';
import { getDb, getNextSequence, writeAuditLog, createNotification, createActivationToken } from '@/lib/db';
import { encryptSensitive, generateToken, hashPassword } from '@/lib/crypto';
import { requireAuth, revokeAllUserSessions } from '@/lib/auth';
import { buildActivationNotificationTemplates, generateMemberCode, hasPermission, isCentralDirectorate } from '@/lib/domain';
import { sendAndLogSms } from '@/lib/sms';
import { syncSingleEntityToSupabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse || !user) return errorResponse!;

  const db = getDb();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() || '';
  const provinceId = searchParams.get('provinceId');
  const categoryId = searchParams.get('categoryId');
  const status = searchParams.get('status');

  // Associates only see their own profile via this endpoint unless they hold management permissions
  const canManageAll = hasPermission(user.role_code, 'MANAGE_MEMBERS_ALL') || isCentralDirectorate(user.role_code);
  const canManageProvince = hasPermission(user.role_code, 'MANAGE_MEMBERS_PROVINCE');

  let sql = `
    SELECT m.id, m.member_code, m.full_name, m.birth_date, m.phone, m.email,
           m.province_id, p.name as province_name, p.code as province_code,
           m.municipality_id, mu.name as municipality_name,
           m.institution, m.academic_degree, m.category_id, mc.name as category_name, mc.monthly_quota_aoa,
           m.photo_path, m.status, m.joined_at, m.documents_json, m.participation_history_json,
           dc.card_number, dc.qr_token, dc.status as card_status, dc.issued_at as card_issued_at, dc.expires_at as card_expires_at,
           (SELECT COUNT(*) FROM quotas q WHERE q.member_id = m.id AND q.status = 'PAGO') as paid_quotas_count,
           (SELECT COALESCE(SUM(q.amount_aoa), 0) FROM quotas q WHERE q.member_id = m.id AND q.status = 'PAGO') as total_contributed_aoa
    FROM members m
    JOIN provinces p ON p.id = m.province_id
    LEFT JOIN municipalities mu ON mu.id = m.municipality_id
    JOIN member_categories mc ON mc.id = m.category_id
    LEFT JOIN digital_cards dc ON dc.member_id = m.id AND dc.status = 'ATIVO'
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (!canManageAll) {
    if (canManageProvince && user.province_id) {
      sql += ` AND m.province_id = ?`;
      params.push(user.province_id);
    } else if (user.member_id) {
      sql += ` AND m.id = ?`;
      params.push(user.member_id);
    } else {
      return NextResponse.json({ members: [] });
    }
  } else if (provinceId) {
    sql += ` AND m.province_id = ?`;
    params.push(Number(provinceId));
  }

  if (categoryId) {
    sql += ` AND m.category_id = ?`;
    params.push(Number(categoryId));
  }
  if (status) {
    sql += ` AND m.status = ?`;
    params.push(status);
  }
  if (q) {
    sql += ` AND (LOWER(m.full_name) LIKE LOWER(?) OR LOWER(m.member_code) LIKE LOWER(?) OR LOWER(m.email) LIKE LOWER(?))`;
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  sql += ` ORDER BY m.created_at DESC`;
  const members = db.prepare(sql).all(...params);
  return NextResponse.json({ members });
}

export async function POST(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse || !user) return errorResponse!;

  const canCreate = hasPermission(user.role_code, 'MANAGE_MEMBERS_ALL') || hasPermission(user.role_code, 'MANAGE_MEMBERS_PROVINCE');
  if (!canCreate) {
    return NextResponse.json({ error: 'Sem permissão para registar associados.' }, { status: 403 });
  }

  const body = await req.json();
  const {
    full_name,
    birth_date,
    id_number,
    phone,
    email,
    province_id,
    municipality_id,
    institution,
    academic_degree,
    category_id,
    photo_path,
    initial_password,
  } = body;

  if (!full_name?.trim() || !phone?.trim() || !email?.trim() || !province_id || !category_id) {
    return NextResponse.json({ error: 'Nome, telefone, e-mail, província e categoria são obrigatórios.' }, { status: 400 });
  }

  const targetProvinceId = Number(province_id);
  if (!isCentralDirectorate(user.role_code) && user.province_id !== targetProvinceId) {
    return NextResponse.json({ error: 'Só pode registar associados na sua própria província.' }, { status: 403 });
  }

  const db = getDb();
  const prov = db.prepare(`SELECT code, name FROM provinces WHERE id = ?`).get(targetProvinceId) as
    | { code: string; name: string }
    | undefined;
  if (!prov) {
    return NextResponse.json({ error: 'Província inválida.' }, { status: 400 });
  }

  const cleanEmail = email.trim().toLowerCase();
  const exists = db.prepare(`SELECT id FROM members WHERE LOWER(email) = LOWER(?)`).get(cleanEmail);
  if (exists) {
    return NextResponse.json({ error: 'Já existe um associado registado com este endereço eletrónico.' }, { status: 409 });
  }

  const year = new Date().getFullYear();
  const res = db.transaction(() => {
    const seq = getNextSequence(db, `MEMBER_${year}`);
    const memberCode = generateMemberCode(prov.code, year, seq);

    const mRes = db.prepare(`
      INSERT INTO members (
        member_code, full_name, birth_date, id_number_encrypted, phone, email,
        province_id, municipality_id, institution, academic_degree, category_id, photo_path, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ATIVO')
    `).run(
      memberCode,
      full_name.trim(),
      birth_date || null,
      encryptSensitive(id_number?.trim() || null),
      phone.trim(),
      cleanEmail,
      targetProvinceId,
      municipality_id ? Number(municipality_id) : null,
      institution?.trim() || '',
      academic_degree?.trim() || '',
      Number(category_id),
      photo_path || null
    );
    const memberId = Number(mRes.lastInsertRowid);

    const cardSeq = getNextSequence(db, `CARD_${year}`);
    const cardNumber = `CART-${year}-${String(cardSeq).padStart(6, '0')}`;
    const qrToken = generateToken(16);
    const expiresAt = new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    db.prepare(`
      INSERT INTO digital_cards (member_id, card_number, member_code, qr_token, expires_at, issuer_name, status)
      VALUES (?, ?, ?, ?, ?, 'Presidência Nacional da AJJ', 'ATIVO')
    `).run(memberId, cardNumber, memberCode, qrToken, expiresAt);

    const existingUser = db.prepare(`SELECT id FROM users WHERE LOWER(email) = LOWER(?)`).get(cleanEmail);
    let activationUrl: string | undefined;
    let smsBodyToSend: string | null = null;
    if (!existingUser) {
      const hasExplicitPass = typeof initial_password === 'string' && initial_password.trim().length >= 6;
      const secretHash = hashPassword(hasExplicitPass ? initial_password.trim() : generateToken(24));
      const uRes = db
        .prepare(
          `
        INSERT INTO users (
          email, phone, password_hash, full_name, role_code, province_id, member_id,
          photo_path, activation_pending, is_active, consent_lgpd
        ) VALUES (?, ?, ?, ?, 'ASSOCIADO', ?, ?, ?, ?, 1, 1)
      `
        )
        .run(
          cleanEmail,
          phone.trim(),
          secretHash,
          full_name.trim(),
          targetProvinceId,
          memberId,
          photo_path || null,
          hasExplicitPass ? 0 : 1
        );
      const userId = Number(uRes.lastInsertRowid);

      if (!hasExplicitPass) {
        const baseUrl = process.env.APP_URL?.replace(/\/$/, '') || '';
        const { rawToken } = createActivationToken(db, userId, 'ACTIVATE', 48);
        activationUrl = `${baseUrl}/ativar?token=${rawToken}`;
        const templates = buildActivationNotificationTemplates({
          fullName: full_name.trim(),
          memberCode,
          activationUrl,
          kind: 'ADESAO',
        });
        smsBodyToSend = templates.smsBody;
        createNotification(db, {
          userId,
          category: 'ASSOCIADO',
          title: templates.emailSubject,
          message: templates.emailBody,
          linkUrl: `/ativar?token=${rawToken}`,
          channel: 'EMAIL',
        });
        createNotification(db, {
          userId,
          category: 'ASSOCIADO',
          title: `Adesão Aprovada · ${memberCode}`,
          message: templates.smsBody,
          linkUrl: `/ativar?token=${rawToken}`,
          channel: 'SMS',
        });
      }

      createNotification(db, {
        userId,
        category: 'ASSOCIADO',
        title: 'Perfil Associativo Registado',
        message: `Código único permanente atribuído: ${memberCode}.`,
        linkUrl: '/painel?tab=cartao',
      });
    }

    writeAuditLog(db, {
      userId: user.id,
      userName: user.full_name,
      roleCode: user.role_code,
      action: 'REGISTO_ASSOCIADO',
      entityType: 'member',
      entityId: memberId,
      details: { memberCode, province: prov.name },
      newState: { status: 'ATIVO', province_id: targetProvinceId },
    });

    return {
      memberId,
      memberCode,
      activationUrl: process.env.EMAIL_WEBHOOK_URL ? undefined : activationUrl,
      smsBodyToSend,
    };
  })();

  if (res.smsBodyToSend && phone.trim()) {
    await sendAndLogSms(db, {
      recipientName: full_name.trim(),
      recipientPhone: phone.trim(),
      message: res.smsBodyToSend,
      category: 'REGISTO_ASSOCIADO',
      relatedEntity: 'member',
      relatedId: res.memberCode,
    });
  }

  const createdMember = db.prepare(`SELECT * FROM members WHERE id = ?`).get(res.memberId) as
    | Record<string, unknown>
    | undefined;
  if (createdMember) {
    void syncSingleEntityToSupabase('members', [createdMember], 'id');
  }
  const createdCards = db.prepare(`SELECT * FROM digital_cards WHERE member_id = ?`).all(res.memberId) as Array<
    Record<string, unknown>
  >;
  if (createdCards.length) {
    void syncSingleEntityToSupabase('digital_cards', createdCards, 'id');
  }
  const createdUser = db.prepare(`SELECT * FROM users WHERE member_id = ?`).get(res.memberId) as
    | Record<string, unknown>
    | undefined;
  if (createdUser) {
    void syncSingleEntityToSupabase('users', [createdUser], 'id');
  }

  return NextResponse.json({
    success: true,
    memberId: res.memberId,
    memberCode: res.memberCode,
    activationUrl: res.activationUrl,
  });
}

export async function PATCH(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse || !user) return errorResponse!;

  const {
    id,
    full_name,
    phone,
    institution,
    academic_degree,
    category_id,
    province_id,
    municipality_id,
    status,
    photo_path,
    supporting_doc_path,
  } = await req.json();
  if (!id) {
    return NextResponse.json({ error: 'ID do associado é obrigatório.' }, { status: 400 });
  }

  const db = getDb();
  const member = db.prepare(`SELECT * FROM members WHERE id = ?`).get(Number(id)) as
    | { id: number; province_id: number; member_code: string; status: string; category_id: number }
    | undefined;
  if (!member) {
    return NextResponse.json({ error: 'Associado não encontrado.' }, { status: 404 });
  }

  const isOwnProfile = user.member_id === member.id;
  const canManageAll = hasPermission(user.role_code, 'MANAGE_MEMBERS_ALL');
  const canManage =
    canManageAll ||
    (hasPermission(user.role_code, 'MANAGE_MEMBERS_PROVINCE') && user.province_id === member.province_id);

  if (!isOwnProfile && !canManage) {
    return NextResponse.json({ error: 'Sem permissão para atualizar este associado.' }, { status: 403 });
  }

  const nextStatus = canManage && status ? status : member.status;
  const nextProvinceId = canManageAll && province_id ? Number(province_id) : member.province_id;

  db.transaction(() => {
    db.prepare(
      `
      UPDATE members
      SET full_name = COALESCE(?, full_name),
          phone = COALESCE(?, phone),
          institution = COALESCE(?, institution),
          academic_degree = COALESCE(?, academic_degree),
          category_id = COALESCE(?, category_id),
          province_id = ?,
          municipality_id = COALESCE(?, municipality_id),
          photo_path = COALESCE(?, photo_path),
          status = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `
    ).run(
      full_name?.trim() || null,
      phone?.trim() || null,
      institution?.trim() || null,
      academic_degree?.trim() || null,
      canManage && category_id ? Number(category_id) : null,
      nextProvinceId,
      municipality_id ? Number(municipality_id) : null,
      photo_path || null,
      nextStatus,
      member.id
    );

    db.prepare(
      `
      UPDATE users
      SET full_name = COALESCE(?, full_name),
          phone = COALESCE(?, phone),
          province_id = ?,
          photo_path = COALESCE(?, photo_path)
      WHERE member_id = ?
    `
    ).run(full_name?.trim() || null, phone?.trim() || null, nextProvinceId, photo_path || null, member.id);

    if (status === 'SUSPENSO' || status === 'INATIVO' || status === 'EXONERADO') {
      const linked = db.prepare(`SELECT id FROM users WHERE member_id = ?`).get(member.id) as { id: number } | undefined;
      if (linked) {
        db.prepare(`UPDATE users SET is_active = 0 WHERE id = ?`).run(linked.id);
        revokeAllUserSessions(linked.id);
      }
    } else if (status === 'ATIVO') {
      db.prepare(`UPDATE users SET is_active = 1 WHERE member_id = ?`).run(member.id);
    }

    writeAuditLog(db, {
      userId: user.id,
      userName: user.full_name,
      roleCode: user.role_code,
      action: nextProvinceId !== member.province_id ? 'TRANSFERENCIA_PROVINCIA_ASSOCIADO' : 'ATUALIZACAO_ASSOCIADO',
      entityType: 'member',
      entityId: member.id,
      details: { memberCode: member.member_code, status: nextStatus },
      previousState: { status: member.status, province_id: member.province_id, category_id: member.category_id },
      newState: { status: nextStatus, province_id: nextProvinceId, category_id: canManage && category_id ? Number(category_id) : member.category_id },
      supportingDocPath: supporting_doc_path || null,
    });
  })();

  const updatedMember = db.prepare(`SELECT * FROM members WHERE id = ?`).get(member.id) as
    | Record<string, unknown>
    | undefined;
  if (updatedMember) {
    void syncSingleEntityToSupabase('members', [updatedMember], 'id');
  }
  const updatedUser = db.prepare(`SELECT * FROM users WHERE member_id = ?`).get(member.id) as
    | Record<string, unknown>
    | undefined;
  if (updatedUser) {
    void syncSingleEntityToSupabase('users', [updatedUser], 'id');
  }

  return NextResponse.json({ success: true });
}
