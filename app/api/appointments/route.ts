import { NextRequest, NextResponse } from 'next/server';
import { getDb, getNextSequence, writeAuditLog, createNotification, createActivationToken } from '@/lib/db';
import { generateToken, hashPassword } from '@/lib/crypto';
import { requireAuth, revokeAllUserSessions } from '@/lib/auth';
import {
  buildActivationNotificationTemplates,
  calculateMandateEndDate,
  canProposeProvincialAppointment,
  generateDispatchNumber,
  generateMemberCode,
  generateTermNumber,
  isCentralDirectorate,
  isPresident,
  requiresCentralValidationForLevel2,
  STATUTORY_ROLES,
} from '@/lib/domain';

function resolveDepartmentIdForRole(db: ReturnType<typeof getDb>, roleCode: string): number | null {
  const def = STATUTORY_ROLES.find((r) => r.code === roleCode);
  if (!def?.departmentCode) return null;
  const row = db.prepare(`SELECT id FROM departments WHERE code = ?`).get(def.departmentCode) as { id: number } | undefined;
  return row?.id ?? null;
}

export async function GET() {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse || !user) return errorResponse!;

  const db = getDb();
  const isNat = isCentralDirectorate(user.role_code);

  let apSql = `
    SELECT ap.*, p.name as province_name, p.code as province_code,
           r.name as role_name, m.member_code,
           COALESCE(ap.candidate_photo_path, m.photo_path) as effective_photo_path,
           u_by.full_name as appointed_by_name,
           u_val.full_name as validated_by_name
    FROM appointments ap
    JOIN provinces p ON p.id = ap.province_id
    JOIN roles r ON r.code = ap.role_code
    LEFT JOIN members m ON m.id = ap.member_id
    LEFT JOIN users u_by ON u_by.id = ap.appointed_by
    LEFT JOIN users u_val ON u_val.id = ap.validated_by
  `;
  const apParams: unknown[] = [];
  if (!isNat) {
    apSql += ` WHERE ap.province_id = ?`;
    apParams.push(user.province_id || -1);
  }
  apSql += ` ORDER BY ap.created_at DESC`;
  const appointments = db.prepare(apSql).all(...apParams);

  const coordinations = db
    .prepare(
      `
    SELECT c.*, p.name as province_name, p.code as province_code,
           u.full_name as coordinator_name, u.email as coordinator_email,
           COALESCE(u.photo_path, m.photo_path) as coordinator_photo,
           m.member_code
    FROM coordinations c
    JOIN provinces p ON p.id = c.province_id
    LEFT JOIN users u ON u.id = c.coordinator_user_id
    LEFT JOIN members m ON m.id = c.coordinator_member_id
    ORDER BY p.name ASC
  `
    )
    .all();

  const membersSql = `
    SELECT m.id, m.member_code, m.full_name, m.email, m.phone, m.province_id, p.name as province_name,
           m.academic_degree, m.institution, m.photo_path, m.status, m.joined_at,
           u.role_code as current_role_code
    FROM members m
    JOIN provinces p ON p.id = m.province_id
    LEFT JOIN users u ON u.member_id = m.id
    WHERE m.status = 'ATIVO'
    ${!isNat ? 'AND m.province_id = ?' : ''}
    ORDER BY m.full_name ASC
  `;
  const candidateMembers = db.prepare(membersSql).all(...(!isNat ? [user.province_id || -1] : []));

  return NextResponse.json({ appointments, coordinations, candidateMembers });
}

export async function POST(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse || !user) return errorResponse!;

  const body = await req.json();
  const {
    province_id,
    candidate_name,
    candidate_email,
    candidate_phone,
    candidate_photo_path,
    attachment_path,
    member_id,
    role_code = 'COORD_PROVINCIAL',
    start_date,
    duration_months = 24,
    process_notes,
    criteria,
    action = 'APPROVE',
    requires_central_validation,
  } = body;

  const targetProvinceId = Number(province_id || user.province_id);
  if (!canProposeProvincialAppointment(user.role_code, user.province_id, targetProvinceId, role_code)) {
    return NextResponse.json(
      { error: 'Permissão insuficiente para instruir nomeações para este cargo ou província.' },
      { status: 403 }
    );
  }

  if (!targetProvinceId || !candidate_name?.trim() || !candidate_email?.trim() || !candidate_phone?.trim()) {
    return NextResponse.json(
      { error: 'Província, nome completo, e-mail e telefone do candidato são obrigatórios.' },
      { status: 400 }
    );
  }

  const db = getDb();
  const province = db.prepare(`SELECT id, code, name FROM provinces WHERE id = ?`).get(targetProvinceId) as
    | { id: number; code: string; name: string }
    | undefined;
  if (!province) {
    return NextResponse.json({ error: 'Província inválida.' }, { status: 400 });
  }

  const roleRow = db.prepare(`SELECT code, name FROM roles WHERE code = ?`).get(role_code) as
    | { code: string; name: string }
    | undefined;
  if (!roleRow) {
    return NextResponse.json({ error: 'Cargo provincial inválido.' }, { status: 400 });
  }

  const cleanEmail = candidate_email.trim().toLowerCase();
  const level = role_code === 'COORD_PROVINCIAL' ? 1 : 2;
  const effectiveStart = start_date || new Date().toISOString().slice(0, 10);
  const months = Math.max(6, Math.min(60, Number(duration_months) || 24));
  const endDate = calculateMandateEndDate(effectiveStart, months);

  if (action === 'REJECT') {
    if (!isPresident(user.role_code)) {
      return NextResponse.json({ error: 'Apenas o Presidente pode rejeitar propostas.' }, { status: 403 });
    }
    const rejRes = db
      .prepare(
        `
      INSERT INTO appointments (
        level, province_id, candidate_name, candidate_email, candidate_phone, candidate_photo_path, attachment_path,
        member_id, role_code, process_notes, criteria_json, status, appointed_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REJEITADA', ?)
    `
      )
      .run(
        level,
        province.id,
        candidate_name.trim(),
        cleanEmail,
        candidate_phone.trim(),
        candidate_photo_path || null,
        attachment_path || null,
        member_id ? Number(member_id) : null,
        role_code,
        process_notes || '',
        JSON.stringify(criteria || {}),
        user.id
      );

    writeAuditLog(db, {
      userId: user.id,
      userName: user.full_name,
      roleCode: user.role_code,
      action: 'NOMEACAO_REJEITADA',
      entityType: 'appointment',
      entityId: Number(rejRes.lastInsertRowid),
      details: { level, province: province.name, candidate: candidate_name.trim(), role_code },
      supportingDocPath: attachment_path || null,
    });

    return NextResponse.json({ success: true, status: 'REJEITADA' });
  }

  const needsCentralValidation =
    !isPresident(user.role_code) &&
    (requires_central_validation === true || requiresCentralValidationForLevel2(role_code));

  if (needsCentralValidation) {
    const propRes = db
      .prepare(
        `
      INSERT INTO appointments (
        level, province_id, candidate_name, candidate_email, candidate_phone, candidate_photo_path, attachment_path,
        member_id, role_code, process_notes, criteria_json, requires_central_validation,
        status, start_date, end_date, duration_months, appointed_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'AGUARDA_VALIDACAO', ?, ?, ?, ?)
    `
      )
      .run(
        level,
        province.id,
        candidate_name.trim(),
        cleanEmail,
        candidate_phone.trim(),
        candidate_photo_path || null,
        attachment_path || null,
        member_id ? Number(member_id) : null,
        role_code,
        process_notes || '',
        JSON.stringify(criteria || {}),
        effectiveStart,
        endDate,
        months,
        user.id
      );

    const centralLeaders = db
      .prepare(`SELECT id FROM users WHERE role_code IN ('PRESIDENTE', 'SECRETARIO_NACIONAL') AND is_active = 1`)
      .all() as Array<{ id: number }>;

    for (const leader of centralLeaders) {
      createNotification(db, {
        userId: leader.id,
        category: 'NOMEACAO',
        title: `Proposta de Nomeação Provincial (${province.name})`,
        message: `${user.full_name} propôs ${candidate_name.trim()} para ${roleRow.name}. Aguarda validação da Direção Central.`,
        linkUrl: '/painel?tab=nomeacoes',
      });
    }

    writeAuditLog(db, {
      userId: user.id,
      userName: user.full_name,
      roleCode: user.role_code,
      action: 'PROPOSTA_NOMEACAO_NIVEL2_SUBMETIDA',
      entityType: 'appointment',
      entityId: Number(propRes.lastInsertRowid),
      details: { province: province.name, role_code, candidate: candidate_name.trim() },
      newState: { status: 'AGUARDA_VALIDACAO' },
      supportingDocPath: attachment_path || null,
    });

    return NextResponse.json({
      success: true,
      appointmentId: Number(propRes.lastInsertRowid),
      status: 'AGUARDA_VALIDACAO',
    });
  }

  const baseUrl = process.env.APP_URL?.replace(/\/$/, '') || '';
  const result = finalizeAppointmentApproval(db, {
    actor: user,
    province,
    roleRow,
    level,
    candidateName: candidate_name.trim(),
    candidateEmail: cleanEmail,
    candidatePhone: candidate_phone.trim(),
    candidatePhotoPath: candidate_photo_path || null,
    attachmentPath: attachment_path || null,
    explicitMemberId: member_id ? Number(member_id) : null,
    effectiveStart,
    endDate,
    months,
    processNotes: process_notes || '',
    criteria: criteria || {},
    baseUrl,
  });

  return NextResponse.json({ success: true, ...result });
}

function finalizeAppointmentApproval(
  db: ReturnType<typeof getDb>,
  params: {
    actor: { id: number; full_name: string; role_code: string };
    province: { id: number; code: string; name: string };
    roleRow: { code: string; name: string };
    level: number;
    candidateName: string;
    candidateEmail: string;
    candidatePhone: string;
    candidatePhotoPath: string | null;
    attachmentPath: string | null;
    explicitMemberId: number | null;
    effectiveStart: string;
    endDate: string;
    months: number;
    processNotes: string;
    criteria: Record<string, unknown>;
    baseUrl: string;
    existingPendingAppointmentId?: number;
  }
) {
  const year = new Date().getFullYear();
  const { actor, province, roleRow, level } = params;

  return db.transaction(() => {
    const seqDispatch = getNextSequence(db, `DESP_${year}`);
    const seqTerm = getNextSequence(db, `TP_${year}`);
    const dispatchNumber = generateDispatchNumber(province.code, year, seqDispatch);
    const termNumber = generateTermNumber(province.code, year, seqTerm);

    // 1. Ensure member exists with unique permanent code
    let memberRow = params.explicitMemberId
      ? (db.prepare(`SELECT id, member_code, photo_path FROM members WHERE id = ?`).get(params.explicitMemberId) as
          | { id: number; member_code: string; photo_path: string | null }
          | undefined)
      : undefined;

    if (!memberRow) {
      memberRow = db
        .prepare(`SELECT id, member_code, photo_path FROM members WHERE LOWER(email) = LOWER(?)`)
        .get(params.candidateEmail) as { id: number; member_code: string; photo_path: string | null } | undefined;
    }

    if (!memberRow) {
      const mSeq = getNextSequence(db, `MEMBER_${year}`);
      const memberCode = generateMemberCode(province.code, year, mSeq);
      const catRow = db.prepare(`SELECT id FROM member_categories ORDER BY id ASC LIMIT 1`).get() as { id: number };
      const mRes = db
        .prepare(
          `
        INSERT INTO members (
          member_code, full_name, phone, email, province_id, category_id, photo_path, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ATIVO')
      `
        )
        .run(
          memberCode,
          params.candidateName,
          params.candidatePhone,
          params.candidateEmail,
          province.id,
          catRow.id,
          params.candidatePhotoPath
        );
      memberRow = { id: Number(mRes.lastInsertRowid), member_code: memberCode, photo_path: params.candidatePhotoPath };
    } else if (params.candidatePhotoPath) {
      db.prepare(`UPDATE members SET photo_path = ? WHERE id = ?`).run(params.candidatePhotoPath, memberRow.id);
    }

    // 2. Ensure/upgrade institutional user profile (no plaintext password!)
    const deptId = resolveDepartmentIdForRole(db, roleRow.code);
    const existingUser = db
      .prepare(`SELECT id, role_code, province_id, activation_pending FROM users WHERE LOWER(email) = LOWER(?) OR member_id = ?`)
      .get(params.candidateEmail, memberRow.id) as
      | { id: number; role_code: string; province_id: number | null; activation_pending: number }
      | undefined;

    const previousState: Record<string, unknown> = existingUser
      ? { role_code: existingUser.role_code, province_id: existingUser.province_id }
      : { account: 'NEW' };

    let userId: number;
    let needsActivationToken = false;

    if (existingUser) {
      userId = existingUser.id;
      db.prepare(
        `
        UPDATE users
        SET role_code = ?, province_id = ?, department_id = COALESCE(?, department_id),
            member_id = ?, is_active = 1, phone = ?, photo_path = COALESCE(?, photo_path)
        WHERE id = ?
      `
      ).run(
        roleRow.code,
        province.id,
        deptId,
        memberRow.id,
        params.candidatePhone,
        params.candidatePhotoPath || memberRow.photo_path,
        userId
      );
      if (existingUser.activation_pending === 1) {
        needsActivationToken = true;
      }
    } else {
      needsActivationToken = true;
      const unusableSecret = hashPassword(generateToken(24));
      const uRes = db
        .prepare(
          `
        INSERT INTO users (
          email, phone, password_hash, full_name, role_code, province_id, department_id,
          member_id, photo_path, activation_pending, is_active, consent_lgpd
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1)
      `
        )
        .run(
          params.candidateEmail,
          params.candidatePhone,
          unusableSecret,
          params.candidateName,
          roleRow.code,
          province.id,
          deptId,
          memberRow.id,
          params.candidatePhotoPath || memberRow.photo_path
        );
      userId = Number(uRes.lastInsertRowid);
    }

    // 3. Ensure active digital card exists
    const existingCard = db.prepare(`SELECT id FROM digital_cards WHERE member_id = ? AND status = 'ATIVO'`).get(memberRow.id);
    if (!existingCard) {
      const cardSeq = getNextSequence(db, `CARD_${year}`);
      const cardNumber = `CART-${year}-${String(cardSeq).padStart(6, '0')}`;
      const qrToken = generateToken(16);
      db.prepare(
        `
        INSERT INTO digital_cards (member_id, card_number, member_code, qr_token, expires_at, issuer_name, status)
        VALUES (?, ?, ?, ?, ?, 'Presidência Nacional da AJJ', 'ATIVO')
      `
      ).run(memberRow.id, cardNumber, memberRow.member_code, qrToken, params.endDate);
    }

    // 4. Activate Provincial Coordination if role is COORD_PROVINCIAL
    if (roleRow.code === 'COORD_PROVINCIAL') {
      db.prepare(
        `
        UPDATE coordinations
        SET status = 'ATIVA',
            coordinator_user_id = ?,
            coordinator_member_id = ?,
            contact_phone = ?,
            contact_email = ?,
            activated_at = COALESCE(activated_at, datetime('now')),
            updated_at = datetime('now')
        WHERE province_id = ?
      `
      ).run(userId, memberRow.id, params.candidatePhone, params.candidateEmail, province.id);
    }

    // 5. Record or update Appointment
    let appointmentId: number;
    if (params.existingPendingAppointmentId) {
      db.prepare(
        `
        UPDATE appointments
        SET member_id = ?, user_id = ?, status = 'APROVADA',
            dispatch_number = ?, term_of_office_number = ?,
            validated_by = ?, validated_at = datetime('now'),
            sms_status = ?, credentials_channel = 'LINK_ATIVACAO_SEGURO'
        WHERE id = ?
      `
      ).run(
        memberRow.id,
        userId,
        dispatchNumber,
        termNumber,
        actor.id,
        process.env.SMS_WEBHOOK_URL ? 'ENVIADO_GATEWAY' : 'REGISTADO_SIMULACAO_SMS',
        params.existingPendingAppointmentId
      );
      appointmentId = params.existingPendingAppointmentId;
    } else {
      const appRes = db
        .prepare(
          `
        INSERT INTO appointments (
          level, province_id, candidate_name, candidate_email, candidate_phone, candidate_photo_path, attachment_path,
          member_id, user_id, role_code, process_notes, criteria_json, status, dispatch_number, term_of_office_number,
          start_date, end_date, duration_months, appointed_by, validated_by, validated_at, sms_status, credentials_channel
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'APROVADA', ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, 'LINK_ATIVACAO_SEGURO')
      `
        )
        .run(
          level,
          province.id,
          params.candidateName,
          params.candidateEmail,
          params.candidatePhone,
          params.candidatePhotoPath,
          params.attachmentPath,
          memberRow.id,
          userId,
          roleRow.code,
          params.processNotes,
          JSON.stringify(params.criteria),
          dispatchNumber,
          termNumber,
          params.effectiveStart,
          params.endDate,
          params.months,
          actor.id,
          actor.id,
          process.env.SMS_WEBHOOK_URL ? 'ENVIADO_GATEWAY' : 'REGISTADO_SIMULACAO_SMS'
        );
      appointmentId = Number(appRes.lastInsertRowid);
    }

    // 6. Generate activation token & official SMS / Email notifications (no plaintext passwords!)
    let activationUrl: string | undefined;
    if (needsActivationToken) {
      const { rawToken } = createActivationToken(db, userId, 'ACTIVATE', 48);
      activationUrl = `${params.baseUrl}/ativar?token=${rawToken}`;
      const templates = buildActivationNotificationTemplates({
        fullName: params.candidateName,
        memberCode: memberRow.member_code,
        activationUrl,
        kind: 'NOMEACAO',
        roleName: roleRow.name,
        provinceName: province.name,
      });

      createNotification(db, {
        userId,
        category: 'NOMEACAO',
        title: templates.emailSubject,
        message: templates.emailBody,
        linkUrl: `/ativar?token=${rawToken}`,
        channel: 'EMAIL',
      });
      createNotification(db, {
        userId,
        category: 'NOMEACAO',
        title: `Nomeação ${roleRow.name} (${province.name})`,
        message: templates.smsBody,
        linkUrl: `/ativar?token=${rawToken}`,
        channel: 'SMS',
      });
    } else {
      createNotification(db, {
        userId,
        category: 'NOMEACAO',
        title: `Nomeação ${roleRow.name} — ${province.name}`,
        message: `Despacho ${dispatchNumber} emitido. O seu acesso administrativo como ${roleRow.name} foi ativado.`,
        linkUrl: '/painel',
        channel: 'SMS',
      });
    }

    createNotification(db, {
      userId,
      category: 'NOMEACAO',
      title: `Mandato Oficializado — ${roleRow.name} (${province.name})`,
      message: `Termo de Posse ${termNumber} e Despacho ${dispatchNumber} disponíveis no SGAJJ.`,
      linkUrl: '/painel',
      channel: 'IN_APP',
    });

    writeAuditLog(db, {
      userId: actor.id,
      userName: actor.full_name,
      roleCode: actor.role_code,
      action: level === 1 ? 'NOMEACAO_COORDENADOR_APROVADA' : 'NOMEACAO_SECRETARIO_PROVINCIAL_APROVADA',
      entityType: 'appointment',
      entityId: appointmentId,
      details: {
        level,
        province: province.name,
        candidate: params.candidateName,
        role_code: roleRow.code,
        memberCode: memberRow.member_code,
        dispatchNumber,
        termNumber,
        endDate: params.endDate,
      },
      previousState,
      newState: { role_code: roleRow.code, province_id: province.id, status: 'APROVADA' },
      supportingDocPath: params.attachmentPath,
    });

    return {
      appointmentId,
      status: 'APROVADA',
      member_code: memberRow.member_code,
      dispatch_number: dispatchNumber,
      term_of_office_number: termNumber,
      start_date: params.effectiveStart,
      end_date: params.endDate,
      activationUrl: process.env.EMAIL_WEBHOOK_URL ? undefined : activationUrl,
    };
  })();
}

export async function PATCH(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse || !user) return errorResponse!;

  const { id, action, termination_reason } = await req.json();
  if (!id || !['EXONERAR', 'VALIDAR_NIVEL_2', 'REJEITAR'].includes(action)) {
    return NextResponse.json({ error: 'Operação inválida.' }, { status: 400 });
  }

  const db = getDb();
  const ap = db
    .prepare(
      `
    SELECT ap.*, p.code as province_code, p.name as province_name, r.name as role_name
    FROM appointments ap
    JOIN provinces p ON p.id = ap.province_id
    JOIN roles r ON r.code = ap.role_code
    WHERE ap.id = ?
  `
    )
    .get(Number(id)) as
    | {
        id: number;
        level: number;
        province_id: number;
        province_code: string;
        province_name: string;
        member_id: number | null;
        user_id: number | null;
        role_code: string;
        role_name: string;
        candidate_name: string;
        candidate_email: string;
        candidate_phone: string;
        candidate_photo_path: string | null;
        attachment_path: string | null;
        start_date: string | null;
        end_date: string | null;
        duration_months: number;
        process_notes: string;
        criteria_json: string;
        status: string;
      }
    | undefined;

  if (!ap) {
    return NextResponse.json({ error: 'Nomeação não encontrada.' }, { status: 404 });
  }

  if (action === 'VALIDAR_NIVEL_2' || action === 'REJEITAR') {
    if (!isPresident(user.role_code)) {
      return NextResponse.json(
        { error: 'Apenas o Presidente da Associação pode validar ou rejeitar propostas pendentes.' },
        { status: 403 }
      );
    }
    if (action === 'REJEITAR') {
      db.prepare(`UPDATE appointments SET status = 'REJEITADA', validated_by = ?, validated_at = datetime('now') WHERE id = ?`).run(
        user.id,
        ap.id
      );
      writeAuditLog(db, {
        userId: user.id,
        userName: user.full_name,
        roleCode: user.role_code,
        action: 'PROPOSTA_NOMEACAO_REJEITADA',
        entityType: 'appointment',
        entityId: ap.id,
        previousState: { status: ap.status },
        newState: { status: 'REJEITADA' },
      });
      return NextResponse.json({ success: true, status: 'REJEITADA' });
    }

    const baseUrl = process.env.APP_URL?.replace(/\/$/, '') || '';
    const effectiveStart = ap.start_date || new Date().toISOString().slice(0, 10);
    const endDate = ap.end_date || calculateMandateEndDate(effectiveStart, ap.duration_months || 24);
    const result = finalizeAppointmentApproval(db, {
      actor: user,
      province: { id: ap.province_id, code: ap.province_code, name: ap.province_name },
      roleRow: { code: ap.role_code, name: ap.role_name },
      level: ap.level,
      candidateName: ap.candidate_name,
      candidateEmail: ap.candidate_email,
      candidatePhone: ap.candidate_phone,
      candidatePhotoPath: ap.candidate_photo_path,
      attachmentPath: ap.attachment_path,
      explicitMemberId: ap.member_id,
      effectiveStart,
      endDate,
      months: ap.duration_months || 24,
      processNotes: ap.process_notes,
      criteria: (() => {
        try {
          return JSON.parse(ap.criteria_json || '{}');
        } catch {
          return {};
        }
      })(),
      baseUrl,
      existingPendingAppointmentId: ap.id,
    });
    return NextResponse.json({ success: true, ...result });
  }

  // action === 'EXONERAR'
  const canDismiss =
    isPresident(user.role_code) ||
    (user.role_code === 'COORD_PROVINCIAL' && user.province_id === ap.province_id && ap.role_code !== 'COORD_PROVINCIAL');
  if (!canDismiss) {
    return NextResponse.json({ error: 'Sem permissão estatutária para exonerar este cargo.' }, { status: 403 });
  }

  db.transaction(() => {
    db.prepare(
      `
      UPDATE appointments
      SET status = 'EXONERADA', termination_reason = ?, terminated_at = datetime('now')
      WHERE id = ?
    `
    ).run(termination_reason || 'Exoneração administrativa por despacho institucional.', ap.id);

    if (ap.role_code === 'COORD_PROVINCIAL') {
      db.prepare(
        `
        UPDATE coordinations
        SET status = 'SUSPENSA', coordinator_user_id = NULL, updated_at = datetime('now')
        WHERE province_id = ? AND coordinator_user_id = ?
      `
      ).run(ap.province_id, ap.user_id);
    }

    if (ap.user_id) {
      db.prepare(`UPDATE users SET role_code = 'ASSOCIADO', department_id = NULL WHERE id = ?`).run(ap.user_id);
      revokeAllUserSessions(ap.user_id);
      createNotification(db, {
        userId: ap.user_id,
        category: 'NOMEACAO',
        title: 'Cessação de Mandato / Exoneração',
        message: termination_reason || 'O seu mandato diretivo foi encerrado e as sessões administrativas foram terminadas.',
        linkUrl: '/painel',
      });
    }

    writeAuditLog(db, {
      userId: user.id,
      userName: user.full_name,
      roleCode: user.role_code,
      action: ap.role_code === 'COORD_PROVINCIAL' ? 'EXONERACAO_COORDENADOR' : 'EXONERACAO_SECRETARIO_PROVINCIAL',
      entityType: 'appointment',
      entityId: ap.id,
      details: { candidate: ap.candidate_name, role_code: ap.role_code, reason: termination_reason },
      previousState: { status: ap.status, role_code: ap.role_code },
      newState: { status: 'EXONERADA', role_code: 'ASSOCIADO' },
    });
  })();

  return NextResponse.json({ success: true });
}
