import { NextRequest, NextResponse } from 'next/server';
import { getDb, getNextSequence, writeAuditLog, createNotification, createActivationToken } from '@/lib/db';
import { encryptSensitive, generateToken, hashPassword } from '@/lib/crypto';
import { getCurrentUser, requireAuth, revokeAllUserSessions } from '@/lib/auth';
import {
  buildActivationNotificationTemplates,
  generateMemberCode,
  generateTrackingNumber,
  hasPermission,
  isCentralDirectorate,
} from '@/lib/domain';
import {
  buildCandidateRegistrationSmsMessage,
  buildCandidateStatusSmsMessage,
  normalizeAngolaPhoneE164,
  sendAndLogSms,
  type SendAndLogSmsResult,
} from '@/lib/sms';
import { syncSingleEntityToSupabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const tracking = searchParams.get('tracking');

  if (tracking) {
    const app = db
      .prepare(
        `
      SELECT a.tracking_number, a.full_name, a.status, a.reviewer_notes, a.created_at, a.updated_at,
             p.name as province_name, c.name as category_name, m.member_code
      FROM applications a
      JOIN provinces p ON p.id = a.province_id
      JOIN member_categories c ON c.id = a.category_id
      LEFT JOIN members m ON m.id = a.member_id
      WHERE UPPER(a.tracking_number) = UPPER(?)
    `
      )
      .get(tracking.trim());

    if (!app) {
      return NextResponse.json({ error: 'Número de candidatura não encontrado.' }, { status: 404 });
    }
    return NextResponse.json({ application: app });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const provinceFilter = searchParams.get('provinceId');
  const statusFilter = searchParams.get('status');

  let sql = `
    SELECT a.id, a.tracking_number, a.full_name, a.birth_date, a.phone, a.email,
           a.province_id, p.name as province_name, a.municipality_id, mu.name as municipality_name,
           a.institution, a.academic_degree, a.category_id, mc.name as category_name,
           a.photo_path, a.documents_json, a.motivation, a.status, a.reviewer_notes,
           a.reviewed_at, a.member_id, mem.member_code, a.created_at
    FROM applications a
    JOIN provinces p ON p.id = a.province_id
    LEFT JOIN municipalities mu ON mu.id = a.municipality_id
    JOIN member_categories mc ON mc.id = a.category_id
    LEFT JOIN members mem ON mem.id = a.member_id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (!isCentralDirectorate(user.role_code)) {
    if (user.role_code === 'ASSOCIADO') {
      sql += ` AND LOWER(a.email) = LOWER(?)`;
      params.push(user.email);
    } else if (user.province_id) {
      sql += ` AND a.province_id = ?`;
      params.push(user.province_id);
    } else {
      return NextResponse.json({ applications: [] });
    }
  } else if (provinceFilter) {
    sql += ` AND a.province_id = ?`;
    params.push(Number(provinceFilter));
  }

  if (statusFilter) {
    sql += ` AND a.status = ?`;
    params.push(statusFilter);
  }

  sql += ` ORDER BY a.created_at DESC`;
  const applications = db.prepare(sql).all(...params);
  return NextResponse.json({ applications });
}

export async function POST(req: NextRequest) {
  const db = getDb();
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
    documents,
    motivation,
    consent_accepted,
  } = body;

  if (!full_name?.trim() || !birth_date || !phone?.trim() || !email?.trim() || !province_id || !category_id) {
    return NextResponse.json(
      { error: 'Preencha todos os campos obrigatórios da candidatura.' },
      { status: 400 }
    );
  }

  if (!consent_accepted) {
    return NextResponse.json(
      { error: 'É obrigatório aceitar os termos estatutários e a política de proteção de dados.' },
      { status: 400 }
    );
  }

  const phoneValidation = normalizeAngolaPhoneE164(phone);
  if (!phoneValidation.ok) {
    return NextResponse.json({ error: phoneValidation.error }, { status: 400 });
  }

  const provinceRow = db.prepare(`SELECT name FROM provinces WHERE id = ?`).get(Number(province_id)) as
    | { name: string }
    | undefined;
  const categoryRow = db.prepare(`SELECT name FROM member_categories WHERE id = ?`).get(Number(category_id)) as
    | { name: string }
    | undefined;

  if (!provinceRow || !categoryRow) {
    return NextResponse.json({ error: 'Província ou categoria associativa inválida.' }, { status: 400 });
  }

  const year = new Date().getFullYear();
  const seq = getNextSequence(db, `CAND_${year}`);
  const trackingNumber = generateTrackingNumber(year, seq);

  const info = db
    .prepare(
      `
    INSERT INTO applications (
      tracking_number, full_name, birth_date, id_number_encrypted, phone, email,
      province_id, municipality_id, institution, academic_degree, category_id,
      photo_path, documents_json, motivation, consent_accepted, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'PENDENTE')
  `
    )
    .run(
      trackingNumber,
      full_name.trim(),
      birth_date,
      encryptSensitive(id_number?.trim() || null),
      phoneValidation.e164,
      email.trim().toLowerCase(),
      Number(province_id),
      municipality_id ? Number(municipality_id) : null,
      institution?.trim() || '',
      academic_degree?.trim() || '',
      Number(category_id),
      photo_path || null,
      JSON.stringify(Array.isArray(documents) ? documents : []),
      motivation?.trim() || ''
    );

  const smsMessage = buildCandidateRegistrationSmsMessage({
    fullName: full_name.trim(),
    trackingNumber,
    provinceName: provinceRow.name,
    categoryName: categoryRow.name,
  });

  const smsDelivery = await sendAndLogSms(db, {
    recipientName: full_name.trim(),
    recipientPhone: phoneValidation.e164,
    message: smsMessage,
    category: 'CANDIDATURA_SUBMETIDA',
    relatedEntity: 'application',
    relatedId: trackingNumber,
  });

  const leaders = db
    .prepare(
      `
    SELECT id FROM users
    WHERE role_code IN ('PRESIDENTE', 'SECRETARIO_NACIONAL')
       OR (role_code = 'COORD_PROVINCIAL' AND province_id = ?)
  `
    )
    .all(Number(province_id)) as Array<{ id: number }>;

  for (const leader of leaders) {
    createNotification(db, {
      userId: leader.id,
      category: 'CANDIDATURA',
      title: `Nova Candidatura: ${trackingNumber}`,
      message: `${full_name.trim()} submeteu pedido de adesão à AJJ (SMS: ${smsDelivery.status}).`,
      linkUrl: '/painel?tab=associados',
    });
  }

  writeAuditLog(db, {
    userName: full_name.trim(),
    roleCode: 'CANDIDATO',
    action: 'SUBMISSAO_CANDIDATURA',
    entityType: 'application',
    entityId: Number(info.lastInsertRowid),
    details: {
      trackingNumber,
      provinceId: province_id,
      smsStatus: smsDelivery.status,
      smsProvider: smsDelivery.provider,
      smsLogId: smsDelivery.logId,
    },
  });

  const insertedApp = db
    .prepare(`SELECT * FROM applications WHERE id = ?`)
    .get(Number(info.lastInsertRowid)) as Record<string, unknown> | undefined;
  if (insertedApp) {
    void syncSingleEntityToSupabase('applications', [insertedApp], 'id');
  }

  return NextResponse.json({
    success: true,
    id: Number(info.lastInsertRowid),
    tracking_number: trackingNumber,
    smsDelivery: {
      logId: smsDelivery.logId,
      status: smsDelivery.status,
      provider: smsDelivery.provider,
      phoneMasked: smsDelivery.phoneMasked,
      sentAt: smsDelivery.sentAt,
      messagePreview: smsDelivery.message,
      errorMessage: smsDelivery.errorMessage,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse || !user) return errorResponse!;

  const canApprove = hasPermission(user.role_code, 'APPROVE_APPLICATIONS');
  const canPropose = hasPermission(user.role_code, 'MANAGE_MEMBERS_PROVINCE');
  if (!canApprove && !canPropose) {
    return NextResponse.json({ error: 'Sem permissão para analisar candidaturas.' }, { status: 403 });
  }

  const { id, status, reviewer_notes } = await req.json();
  if (!id || !status) {
    return NextResponse.json({ error: 'ID e novo estado são obrigatórios.' }, { status: 400 });
  }

  const db = getDb();
  const app = db
    .prepare(
      `
    SELECT a.*, p.code as province_code, p.name as province_name
    FROM applications a
    JOIN provinces p ON p.id = a.province_id
    WHERE a.id = ?
  `
    )
    .get(Number(id)) as
    | {
        id: number;
        tracking_number: string;
        full_name: string;
        birth_date: string;
        id_number_encrypted: string | null;
        phone: string;
        email: string;
        province_id: number;
        province_code: string;
        province_name: string;
        municipality_id: number | null;
        institution: string;
        academic_degree: string;
        category_id: number;
        photo_path: string | null;
        documents_json: string;
        status: string;
        member_id: number | null;
      }
    | undefined;

  if (!app) {
    return NextResponse.json({ error: 'Candidatura não encontrada.' }, { status: 404 });
  }

  if (!isCentralDirectorate(user.role_code) && user.province_id !== app.province_id) {
    return NextResponse.json({ error: 'Apenas pode analisar candidaturas da sua província.' }, { status: 403 });
  }

  if (status === 'APROVADA' && !canApprove) {
    return NextResponse.json(
      { error: 'A aprovação definitiva de associados compete ao Presidente ou Secretário Nacional.' },
      { status: 403 }
    );
  }

  const baseUrl = process.env.APP_URL?.replace(/\/$/, '') || '';

  const result = db.transaction(() => {
    let createdMemberCode: string | null = null;
    let createdMemberId = app.member_id;
    let activationUrl: string | undefined;

    if (status === 'APROVADA') {
      const year = new Date().getFullYear();
      const existingMember = db
        .prepare(`SELECT id, member_code FROM members WHERE LOWER(email) = LOWER(?)`)
        .get(app.email) as { id: number; member_code: string } | undefined;

      if (existingMember) {
        createdMemberId = existingMember.id;
        createdMemberCode = existingMember.member_code;
        db.prepare(`UPDATE members SET status = 'ATIVO', updated_at = datetime('now') WHERE id = ?`).run(existingMember.id);
      } else {
        const seq = getNextSequence(db, `MEMBER_${year}`);
        createdMemberCode = generateMemberCode(app.province_code, year, seq);

        const memRes = db
          .prepare(
            `
          INSERT INTO members (
            member_code, full_name, birth_date, id_number_encrypted, phone, email,
            province_id, municipality_id, institution, academic_degree, category_id,
            photo_path, status, documents_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ATIVO', ?)
        `
          )
          .run(
            createdMemberCode,
            app.full_name,
            app.birth_date,
            app.id_number_encrypted,
            app.phone,
            app.email,
            app.province_id,
            app.municipality_id,
            app.institution,
            app.academic_degree,
            app.category_id,
            app.photo_path,
            app.documents_json
          );
        createdMemberId = Number(memRes.lastInsertRowid);
      }

      const activeCard = db
        .prepare(`SELECT id FROM digital_cards WHERE member_id = ? AND status = 'ATIVO'`)
        .get(createdMemberId);
      if (!activeCard) {
        const cardSeq = getNextSequence(db, `CARD_${year}`);
        const cardNumber = `CART-${year}-${String(cardSeq).padStart(6, '0')}`;
        const qrToken = generateToken(16);
        const expiresAt = new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        db.prepare(
          `
          INSERT INTO digital_cards (member_id, card_number, member_code, qr_token, expires_at, issuer_name, status)
          VALUES (?, ?, ?, ?, ?, 'Presidência Nacional da AJJ', 'ATIVO')
        `
        ).run(createdMemberId, cardNumber, createdMemberCode, qrToken, expiresAt);
      }

      let targetUserId: number;
      const existingUser = db.prepare(`SELECT id FROM users WHERE LOWER(email) = LOWER(?)`).get(app.email) as
        | { id: number }
        | undefined;

      if (!existingUser) {
        const unusableInitialSecret = hashPassword(generateToken(24));
        const userRes = db
          .prepare(
            `
          INSERT INTO users (
            email, phone, password_hash, full_name, role_code, province_id, member_id,
            photo_path, activation_pending, is_active, consent_lgpd
          ) VALUES (?, ?, ?, ?, 'ASSOCIADO', ?, ?, ?, 1, 1, 1)
        `
          )
          .run(
            app.email,
            app.phone,
            unusableInitialSecret,
            app.full_name,
            app.province_id,
            createdMemberId,
            app.photo_path || null
          );
        targetUserId = Number(userRes.lastInsertRowid);
      } else {
        targetUserId = existingUser.id;
        db.prepare(
          `
          UPDATE users
          SET member_id = COALESCE(member_id, ?), province_id = ?, is_active = 1,
              photo_path = COALESCE(?, photo_path)
          WHERE id = ?
        `
        ).run(createdMemberId, app.province_id, app.photo_path || null, targetUserId);
      }

      const { rawToken } = createActivationToken(db, targetUserId, 'ACTIVATE', 48);
      activationUrl = `${baseUrl}/ativar?token=${rawToken}`;

      const templates = buildActivationNotificationTemplates({
        fullName: app.full_name,
        memberCode: createdMemberCode,
        activationUrl,
        kind: 'ADESAO',
      });

      createNotification(db, {
        userId: targetUserId,
        category: 'ADESAO',
        title: templates.emailSubject,
        message: templates.emailBody,
        linkUrl: `/ativar?token=${rawToken}`,
        channel: 'EMAIL',
      });

      createNotification(db, {
        userId: targetUserId,
        category: 'ADESAO',
        title: `Adesão Aprovada · ${createdMemberCode}`,
        message: templates.smsBody,
        linkUrl: `/ativar?token=${rawToken}`,
        channel: 'SMS',
      });

      createNotification(db, {
        userId: targetUserId,
        category: 'ADESAO',
        title: 'Candidatura Aprovada — Bem-vindo à AJJ',
        message: `A sua inscrição foi aprovada com o código permanente ${createdMemberCode}.`,
        linkUrl: '/painel?tab=cartao',
        channel: 'IN_APP',
      });
    } else if (status === 'SUSPENSA' || status === 'REJEITADA') {
      if (app.member_id) {
        const linkedUser = db.prepare(`SELECT id FROM users WHERE member_id = ?`).get(app.member_id) as
          | { id: number }
          | undefined;
        if (linkedUser) {
          db.prepare(`UPDATE users SET is_active = 0 WHERE id = ?`).run(linkedUser.id);
          revokeAllUserSessions(linkedUser.id);
        }
      }
    }

    db.prepare(
      `
      UPDATE applications
      SET status = ?, reviewer_notes = ?, reviewed_by = ?, reviewed_at = datetime('now'),
          member_id = COALESCE(?, member_id), updated_at = datetime('now')
      WHERE id = ?
    `
    ).run(status, reviewer_notes || '', user.id, createdMemberId, app.id);

    writeAuditLog(db, {
      userId: user.id,
      userName: user.full_name,
      roleCode: user.role_code,
      action: `CANDIDATURA_${status}`,
      entityType: 'application',
      entityId: app.id,
      details: { trackingNumber: app.tracking_number, memberCode: createdMemberCode },
      previousState: { status: app.status },
      newState: { status, memberCode: createdMemberCode },
    });

    let smsBodyToSend: string | null = null;
    if (status === 'APROVADA' && createdMemberCode && activationUrl) {
      smsBodyToSend = buildActivationNotificationTemplates({
        fullName: app.full_name,
        memberCode: createdMemberCode,
        activationUrl,
        kind: 'ADESAO',
      }).smsBody;
    } else if (['APROVADA', 'REJEITADA', 'AGUARDA_DOCUMENTACAO'].includes(status)) {
      smsBodyToSend = buildCandidateStatusSmsMessage({
        fullName: app.full_name,
        trackingNumber: app.tracking_number,
        status,
        memberCode: createdMemberCode,
      });
    }

    return {
      member_code: createdMemberCode,
      member_id: createdMemberId,
      activationUrl: process.env.EMAIL_WEBHOOK_URL ? undefined : activationUrl,
      smsBodyToSend,
    };
  })();

  let smsDelivery: SendAndLogSmsResult | null = null;
  if (result.smsBodyToSend && app.phone) {
    smsDelivery = await sendAndLogSms(db, {
      recipientName: app.full_name,
      recipientPhone: app.phone,
      message: result.smsBodyToSend,
      category: `CANDIDATURA_${status}`,
      relatedEntity: 'application',
      relatedId: app.tracking_number,
    });
  }

  const updatedApp = db.prepare(`SELECT * FROM applications WHERE id = ?`).get(app.id) as
    | Record<string, unknown>
    | undefined;
  if (updatedApp) {
    void syncSingleEntityToSupabase('applications', [updatedApp], 'id');
  }

  if (result.member_id) {
    const syncedMember = db.prepare(`SELECT * FROM members WHERE id = ?`).get(result.member_id) as
      | Record<string, unknown>
      | undefined;
    if (syncedMember) {
      void syncSingleEntityToSupabase('members', [syncedMember], 'id');
    }

    const syncedCards = db
      .prepare(`SELECT * FROM digital_cards WHERE member_id = ?`)
      .all(result.member_id) as Array<Record<string, unknown>>;
    if (syncedCards.length) {
      void syncSingleEntityToSupabase('digital_cards', syncedCards, 'id');
    }

    const syncedUser = db.prepare(`SELECT * FROM users WHERE member_id = ?`).get(result.member_id) as
      | Record<string, unknown>
      | undefined;
    if (syncedUser) {
      void syncSingleEntityToSupabase('users', [syncedUser], 'id');
    }
  }

  return NextResponse.json({
    success: true,
    member_code: result.member_code,
    member_id: result.member_id,
    activationUrl: result.activationUrl,
    smsDelivery: smsDelivery
      ? {
          logId: smsDelivery.logId,
          status: smsDelivery.status,
          provider: smsDelivery.provider,
          phoneMasked: smsDelivery.phoneMasked,
        }
      : null,
  });
}
