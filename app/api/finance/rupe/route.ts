import { NextRequest, NextResponse } from 'next/server';
import { createNotification, getDb, getNextSequence, writeAuditLog } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import {
  AJJ_BENEFICIARY_NAME,
  AJJ_INSTITUTIONAL_IBAN_DISPLAY,
  ANGOLAN_BANKS,
  type AngolanBankCode,
  buildAngolanBankPaymentInstructions,
  formatAoa,
  generateReceiptNumber,
  generateRupeReference,
  getAngolanBankInfo,
  hasPermission,
  isCentralDirectorate,
  normalizeAngolanIban,
} from '@/lib/domain';
import { isValidEmailAddress, sendAndLogEmail } from '@/lib/email';
import { syncSingleEntityToSupabase } from '@/lib/supabase';

const VALID_BANK_CODES = new Set<AngolanBankCode>(['BAI', 'BIC', 'BFA', 'BCI', 'MULTICAIXA']);

function getInstitutionalBankConfig() {
  const db = getDb();
  const settings = db
    .prepare(`SELECT organization_name, institutional_iban FROM system_settings WHERE id = 1`)
    .get() as { organization_name?: string; institutional_iban?: string } | undefined;

  const ibanInfo = normalizeAngolanIban(settings?.institutional_iban || AJJ_INSTITUTIONAL_IBAN_DISPLAY);
  return {
    beneficiaryName: AJJ_BENEFICIARY_NAME,
    bankName: 'Banco BAI (0040)',
    ibanRaw: ibanInfo.raw21,
    ibanDisplay: ibanInfo.display21,
    ibanAo06: ibanInfo.fullAo06,
    banks: ANGOLAN_BANKS,
  };
}

export async function GET(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse || !user) return errorResponse!;

  const db = getDb();
  // Expire stale unpaid RUPEs automatically
  db.prepare(`
    UPDATE quota_rupes
    SET status = 'EXPIRADO', updated_at = datetime('now')
    WHERE status = 'AGUARDA_PAGAMENTO' AND expires_at < ?
  `).run(new Date().toISOString());

  const canNational =
    hasPermission(user.role_code, 'MANAGE_NATIONAL_FINANCE') || isCentralDirectorate(user.role_code);
  const canProvincial = hasPermission(user.role_code, 'MANAGE_PROVINCIAL_FINANCE');
  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get('status')?.trim();
  const bankFilter = searchParams.get('bankCode')?.trim();

  let sql = `
    SELECT r.*, m.full_name as member_name, m.member_code, m.email as member_email,
           p.name as province_name, u_c.full_name as created_by_name, u_ok.full_name as confirmed_by_name
    FROM quota_rupes r
    LEFT JOIN members m ON m.id = r.member_id
    LEFT JOIN provinces p ON p.id = r.province_id
    LEFT JOIN users u_c ON u_c.id = r.created_by
    LEFT JOIN users u_ok ON u_ok.id = r.confirmed_by
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (canNational) {
    // Full visibility
  } else if (canProvincial && user.province_id) {
    sql += ` AND (r.province_id = ? OR r.member_id = ?)`;
    params.push(user.province_id, user.member_id || -1);
  } else if (user.member_id) {
    sql += ` AND r.member_id = ?`;
    params.push(user.member_id);
  } else {
    sql += ` AND r.created_by = ?`;
    params.push(user.id);
  }

  if (statusFilter) {
    sql += ` AND r.status = ?`;
    params.push(statusFilter);
  }
  if (bankFilter) {
    sql += ` AND r.bank_code = ?`;
    params.push(bankFilter);
  }

  sql += ` ORDER BY r.id DESC LIMIT 120`;
  const rupes = db.prepare(sql).all(...params);

  return NextResponse.json({
    rupes,
    bankConfig: getInstitutionalBankConfig(),
  });
}

export async function POST(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse || !user) return errorResponse!;

  const db = getDb();
  const body = await req.json();

  const bankCodeRaw = String(body.bank_code || 'BAI').trim().toUpperCase() as AngolanBankCode;
  if (!VALID_BANK_CODES.has(bankCodeRaw)) {
    return NextResponse.json(
      { error: 'Selecione um banco angolano válido (BAI, BIC, BFA, BCI ou Multicaixa Express).' },
      { status: 400 }
    );
  }

  const referenceMonth = String(body.reference_month || new Date().toISOString().slice(0, 7)).trim();
  if (!/^\d{4}-\d{2}$/.test(referenceMonth)) {
    return NextResponse.json({ error: 'Mês de referência inválido (use o formato AAAA-MM).' }, { status: 400 });
  }

  const amountAoa = Number(body.amount_aoa);
  if (!Number.isFinite(amountAoa) || amountAoa <= 0) {
    return NextResponse.json({ error: 'Indique um montante positivo válido em AOA.' }, { status: 400 });
  }

  const canNational =
    hasPermission(user.role_code, 'MANAGE_NATIONAL_FINANCE') || isCentralDirectorate(user.role_code);
  const canProvincial = hasPermission(user.role_code, 'MANAGE_PROVINCIAL_FINANCE');

  let targetMemberId: number | null = null;
  let targetProvinceId: number | null = user.province_id ?? null;
  let memberCode: string | null = user.member_code ?? null;

  if (canNational || canProvincial) {
    const requestedMemberId = body.member_id ? Number(body.member_id) : user.member_id;
    if (requestedMemberId) {
      const mem = db
        .prepare(`SELECT id, province_id, member_code FROM members WHERE id = ?`)
        .get(requestedMemberId) as { id: number; province_id: number; member_code: string } | undefined;
      if (!mem) {
        return NextResponse.json({ error: 'Associado selecionado não encontrado.' }, { status: 404 });
      }
      if (!canNational && user.province_id && mem.province_id !== user.province_id) {
        return NextResponse.json(
          { error: 'Sem permissão para gerar RUPE para associado de outra província.' },
          { status: 403 }
        );
      }
      targetMemberId = mem.id;
      targetProvinceId = mem.province_id;
      memberCode = mem.member_code;
    } else if (!canNational) {
      return NextResponse.json({ error: 'Selecione o associado para gerar o RUPE.' }, { status: 400 });
    }
  } else {
    if (!user.member_id) {
      return NextResponse.json(
        { error: 'A sua conta ainda não possui ficha de associado vinculada.' },
        { status: 400 }
      );
    }
    targetMemberId = user.member_id;
    targetProvinceId = user.province_id ?? null;
    memberCode = user.member_code ?? null;
  }

  const bankConfig = getInstitutionalBankConfig();
  const bankInfo = getAngolanBankInfo(bankCodeRaw);
  const year = new Date().getUTCFullYear();
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

  const created = db.transaction(() => {
    const seq = getNextSequence(db, `RUPE_${year}`);
    const ref = generateRupeReference({
      iban: bankConfig.ibanRaw,
      sequenceNumber: seq,
      year,
    });

    const ins = db.prepare(`
      INSERT INTO quota_rupes (
        rupe_code, rupe_formatted, member_id, province_id, reference_month, amount_aoa,
        bank_code, bank_name, beneficiary_iban, beneficiary_iban_ao06, beneficiary_name,
        status, expires_at, created_by, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AGUARDA_PAGAMENTO', ?, ?, ?)
    `).run(
      ref.rupeCode,
      ref.rupeFormatted,
      targetMemberId,
      targetProvinceId,
      referenceMonth,
      amountAoa,
      bankInfo.code,
      bankInfo.name,
      ref.ibanDisplay,
      ref.ibanAo06,
      bankConfig.beneficiaryName,
      expiresAt,
      user.id,
      String(body.notes || '').trim()
    );

    const row = db
      .prepare(`
        SELECT r.*, m.full_name as member_name, m.member_code, m.email as member_email,
               p.name as province_name
        FROM quota_rupes r
        LEFT JOIN members m ON m.id = r.member_id
        LEFT JOIN provinces p ON p.id = r.province_id
        WHERE r.id = ?
      `)
      .get(Number(ins.lastInsertRowid)) as Record<string, unknown>;

    writeAuditLog(db, {
      userId: user.id,
      userName: user.full_name,
      roleCode: user.role_code,
      action: 'RUPE_GERADO',
      entityType: 'quota_rupe',
      entityId: Number(ins.lastInsertRowid),
      details: {
        rupeCode: ref.rupeCode,
        bankCode: bankInfo.code,
        iban: ref.ibanDisplay,
        referenceMonth,
        amountAoa,
        memberId: targetMemberId,
      },
    });

    return row;
  })();

  const rawRow = db.prepare(`SELECT * FROM quota_rupes WHERE id = ?`).get(created.id as number) as
    | Record<string, unknown>
    | undefined;
  if (rawRow) {
    void syncSingleEntityToSupabase('quota_rupes', [rawRow], 'id');
  }

  const instructions = buildAngolanBankPaymentInstructions({
    bankCode: bankInfo.code,
    rupeFormatted: String(created.rupe_formatted),
    amountAoa,
    ibanDisplay: String(created.beneficiary_iban),
    ibanAo06: String(created.beneficiary_iban_ao06),
    referenceMonth,
    memberCode,
  });

  return NextResponse.json({
    success: true,
    rupe: created,
    instructions,
    bankConfig,
  });
}

export async function PATCH(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse || !user) return errorResponse!;

  const db = getDb();
  const body = await req.json();
  const id = Number(body.id);
  const action = String(body.action || '').trim();

  if (!id || !['SUBMIT_PROOF', 'CONFIRM_PAYMENT', 'REJECT_PROOF', 'CANCEL'].includes(action)) {
    return NextResponse.json({ error: 'Operação de RUPE inválida.' }, { status: 400 });
  }

  const rupe = db.prepare(`SELECT * FROM quota_rupes WHERE id = ?`).get(id) as
    | {
        id: number;
        rupe_code: string;
        rupe_formatted: string;
        member_id: number | null;
        province_id: number | null;
        reference_month: string;
        amount_aoa: number;
        bank_code: AngolanBankCode;
        bank_name: string;
        beneficiary_iban: string;
        beneficiary_iban_ao06: string;
        status: string;
        proof_reference: string;
        proof_path: string | null;
        created_by: number | null;
      }
    | undefined;

  if (!rupe) {
    return NextResponse.json({ error: 'Referência RUPE não encontrada.' }, { status: 404 });
  }

  const canNational =
    hasPermission(user.role_code, 'MANAGE_NATIONAL_FINANCE') || isCentralDirectorate(user.role_code);
  const canProvincial =
    hasPermission(user.role_code, 'MANAGE_PROVINCIAL_FINANCE') &&
    Boolean(user.province_id && rupe.province_id === user.province_id);
  const isOwner =
    (rupe.member_id !== null && user.member_id === rupe.member_id) || rupe.created_by === user.id;

  if (action === 'SUBMIT_PROOF') {
    if (!isOwner && !canNational && !canProvincial) {
      return NextResponse.json({ error: 'Sem permissão para submeter comprovativo deste RUPE.' }, { status: 403 });
    }
    if (rupe.status === 'PAGO' || rupe.status === 'CANCELADO') {
      return NextResponse.json({ error: 'Este RUPE já foi liquidado ou cancelado.' }, { status: 400 });
    }
    const proofRef = String(body.proof_reference || '').trim();
    const proofPath = body.proof_path ? String(body.proof_path).trim() : rupe.proof_path;
    if (!proofRef && !proofPath) {
      return NextResponse.json(
        { error: 'Indique o número da operação bancária / borderô ou anexe o comprovativo.' },
        { status: 400 }
      );
    }

    db.prepare(`
      UPDATE quota_rupes
      SET status = 'COMPROVATIVO_SUBMETIDO',
          proof_reference = ?,
          proof_path = ?,
          submitted_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(proofRef, proofPath || null, rupe.id);

    const financeOfficers = db
      .prepare(
        `SELECT id FROM users WHERE is_active = 1 AND (role_code IN ('PRESIDENTE', 'DIR_NAC_FINANCAS') OR (role_code IN ('COORD_PROVINCIAL', 'RESP_PROV_FINANCAS') AND province_id = ?))`
      )
      .all(rupe.province_id || -1) as Array<{ id: number }>;

    for (const officer of financeOfficers) {
      createNotification(db, {
        userId: officer.id,
        category: 'QUOTA_COMPROVATIVO',
        title: `Comprovativo Bancário Submetido (${rupe.bank_code})`,
        message: `RUPE ${rupe.rupe_formatted} (${formatAoa(rupe.amount_aoa)}) aguarda confirmação na Tesouraria.`,
        linkUrl: '/painel',
      });
    }

    writeAuditLog(db, {
      userId: user.id,
      userName: user.full_name,
      roleCode: user.role_code,
      action: 'RUPE_COMPROVATIVO_SUBMETIDO',
      entityType: 'quota_rupe',
      entityId: rupe.id,
      details: { rupeCode: rupe.rupe_code, bankCode: rupe.bank_code, proofReference: proofRef },
    });

    const updated = db.prepare(`SELECT * FROM quota_rupes WHERE id = ?`).get(rupe.id) as Record<string, unknown>;
    void syncSingleEntityToSupabase('quota_rupes', [updated], 'id');
    return NextResponse.json({ success: true, rupe: updated });
  }

  if (action === 'CONFIRM_PAYMENT') {
    if (!canNational && !canProvincial) {
      return NextResponse.json(
        { error: 'Apenas a Tesouraria Nacional ou Financeiro Provincial pode confirmar liquidação de RUPE.' },
        { status: 403 }
      );
    }
    if (rupe.status === 'PAGO') {
      return NextResponse.json({ error: 'Este RUPE já se encontra liquidado.' }, { status: 400 });
    }
    if (rupe.status === 'CANCELADO') {
      return NextResponse.json({ error: 'Não é possível liquidar um RUPE cancelado.' }, { status: 400 });
    }

    const settlementScope =
      canNational && body.settlement_scope !== 'PROVINCIAL'
        ? 'NACIONAL'
        : rupe.province_id
          ? 'PROVINCIAL'
          : 'NACIONAL';

    const account = db
      .prepare(
        settlementScope === 'NACIONAL'
          ? `SELECT id FROM financial_accounts WHERE scope = 'NACIONAL' LIMIT 1`
          : `SELECT id FROM financial_accounts WHERE scope = 'PROVINCIAL' AND province_id = ? LIMIT 1`
      )
      .get(...(settlementScope === 'NACIONAL' ? [] : [rupe.province_id])) as { id: number } | undefined;

    if (!account) {
      return NextResponse.json({ error: 'Conta financeira de destino não localizada.' }, { status: 404 });
    }

    const year = new Date().getUTCFullYear();
    const refDate = new Date().toISOString().slice(0, 10);
    const proofRefOverride = String(body.proof_reference || rupe.proof_reference || '').trim();

    const settled = db.transaction(() => {
      const seq = getNextSequence(db, `REC_${year}`);
      const receiptNumber = generateReceiptNumber(year, seq);
      const description = `Quota ${rupe.reference_month} via ${rupe.bank_code} · RUPE ${rupe.rupe_formatted}${proofRefOverride ? ` · Ref: ${proofRefOverride}` : ''}`;

      const txRes = db
        .prepare(`
          INSERT INTO financial_transactions (
            account_id, province_id, scope, type, category, description, amount_aoa,
            reference_date, receipt_number, status, approved_by, approved_at,
            attachment_path, bank_code, rupe_code, payment_channel, member_id, created_by
          ) VALUES (?, ?, ?, 'QUOTA', 'Quotas Bancárias (RUPE)', ?, ?, ?, ?, 'APROVADO', ?, datetime('now'), ?, ?, ?, ?, ?, ?)
        `)
        .run(
          account.id,
          settlementScope === 'NACIONAL' ? null : rupe.province_id,
          settlementScope,
          description,
          rupe.amount_aoa,
          refDate,
          receiptNumber,
          user.id,
          rupe.proof_path || null,
          rupe.bank_code,
          rupe.rupe_code,
          rupe.bank_name,
          rupe.member_id,
          user.id
        );

      const txId = Number(txRes.lastInsertRowid);

      db.prepare(
        `UPDATE financial_accounts SET balance_aoa = balance_aoa + ?, updated_at = datetime('now') WHERE id = ?`
      ).run(rupe.amount_aoa, account.id);

      if (rupe.member_id && rupe.province_id) {
        db.prepare(`
          INSERT INTO quotas (member_id, province_id, reference_month, amount_aoa, status, paid_at, receipt_number, recorded_by)
          VALUES (?, ?, ?, ?, 'PAGO', datetime('now'), ?, ?)
          ON CONFLICT(member_id, reference_month) DO UPDATE SET
            status = 'PAGO',
            amount_aoa = excluded.amount_aoa,
            paid_at = datetime('now'),
            receipt_number = excluded.receipt_number
        `).run(rupe.member_id, rupe.province_id, rupe.reference_month, rupe.amount_aoa, receiptNumber, user.id);
      }

      db.prepare(`
        UPDATE quota_rupes
        SET status = 'PAGO',
            proof_reference = ?,
            paid_at = datetime('now'),
            receipt_number = ?,
            transaction_id = ?,
            confirmed_by = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(proofRefOverride, receiptNumber, txId, user.id, rupe.id);

      writeAuditLog(db, {
        userId: user.id,
        userName: user.full_name,
        roleCode: user.role_code,
        action: 'RUPE_PAGAMENTO_CONFIRMADO',
        entityType: 'quota_rupe',
        entityId: rupe.id,
        details: {
          rupeCode: rupe.rupe_code,
          receiptNumber,
          amountAoa: rupe.amount_aoa,
          bankCode: rupe.bank_code,
          settlementScope,
        },
      });

      return { txId, receiptNumber };
    })();

    const updatedRupe = db.prepare(`SELECT * FROM quota_rupes WHERE id = ?`).get(rupe.id) as Record<string, unknown>;
    const txRow = db
      .prepare(`SELECT * FROM financial_transactions WHERE id = ?`)
      .get(settled.txId) as Record<string, unknown>;
    const accRow = db
      .prepare(`SELECT * FROM financial_accounts WHERE id = ?`)
      .get(account.id) as Record<string, unknown>;
    void syncSingleEntityToSupabase('quota_rupes', [updatedRupe], 'id');
    void syncSingleEntityToSupabase('financial_transactions', [txRow], 'id');
    void syncSingleEntityToSupabase('financial_accounts', [accRow], 'id');

    if (rupe.member_id) {
      const memUser = db
        .prepare(`SELECT u.id, u.email, u.full_name FROM users u WHERE u.member_id = ? LIMIT 1`)
        .get(rupe.member_id) as { id: number; email: string; full_name: string } | undefined;
      const quotaRow = db
        .prepare(`SELECT * FROM quotas WHERE member_id = ? AND reference_month = ?`)
        .get(rupe.member_id, rupe.reference_month) as Record<string, unknown> | undefined;
      if (quotaRow) {
        void syncSingleEntityToSupabase('quotas', [quotaRow], 'id');
      }

      if (memUser) {
        createNotification(db, {
          userId: memUser.id,
          category: 'QUOTA_PAGA',
          title: `Quota ${rupe.reference_month} Confirmada`,
          message: `Pagamento via ${rupe.bank_code} (RUPE ${rupe.rupe_formatted}) liquidado · Recibo ${settled.receiptNumber}.`,
          linkUrl: '/painel',
        });

        if (isValidEmailAddress(memUser.email)) {
          void sendAndLogEmail(db, {
            recipientName: memUser.full_name,
            recipientEmail: memUser.email,
            subject: `AJJ — Recibo de Pagamento de Quota (${settled.receiptNumber})`,
            textBody:
              `Prezado(a) ${memUser.full_name},\n\n` +
              `Confirmamos a liquidação da sua quota referente a ${rupe.reference_month}.\n` +
              `Banco/Canal: ${rupe.bank_name}\n` +
              `RUPE: ${rupe.rupe_formatted}\n` +
              `Montante: ${formatAoa(rupe.amount_aoa)}\n` +
              `Recibo Oficial: ${settled.receiptNumber}\n\n` +
              `Associação de Jovens Juristas (AJJ) — Juntos em prol do bem maior.`,
            category: 'RECIBO_QUOTA',
            relatedEntity: 'quota_rupe',
            relatedId: rupe.rupe_code,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      receipt_number: settled.receiptNumber,
      rupe: updatedRupe,
    });
  }

  if (action === 'REJECT_PROOF') {
    if (!canNational && !canProvincial) {
      return NextResponse.json({ error: 'Sem permissão para rejeitar comprovativo.' }, { status: 403 });
    }
    if (rupe.status === 'PAGO') {
      return NextResponse.json({ error: 'RUPE já liquidado.' }, { status: 400 });
    }
    const notes = String(body.notes || 'Comprovativo bancário não validado pela Tesouraria.').trim();
    db.prepare(`
      UPDATE quota_rupes
      SET status = 'AGUARDA_PAGAMENTO', notes = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(notes, rupe.id);
    writeAuditLog(db, {
      userId: user.id,
      userName: user.full_name,
      roleCode: user.role_code,
      action: 'RUPE_COMPROVATIVO_REJEITADO',
      entityType: 'quota_rupe',
      entityId: rupe.id,
      details: { rupeCode: rupe.rupe_code, notes },
    });
    const updated = db.prepare(`SELECT * FROM quota_rupes WHERE id = ?`).get(rupe.id) as Record<string, unknown>;
    void syncSingleEntityToSupabase('quota_rupes', [updated], 'id');
    return NextResponse.json({ success: true, rupe: updated });
  }

  // CANCEL
  if (!isOwner && !canNational && !canProvincial) {
    return NextResponse.json({ error: 'Sem permissão para cancelar este RUPE.' }, { status: 403 });
  }
  if (rupe.status === 'PAGO') {
    return NextResponse.json({ error: 'Não é possível cancelar um RUPE já liquidado.' }, { status: 400 });
  }
  db.prepare(`UPDATE quota_rupes SET status = 'CANCELADO', updated_at = datetime('now') WHERE id = ?`).run(rupe.id);
  writeAuditLog(db, {
    userId: user.id,
    userName: user.full_name,
    roleCode: user.role_code,
    action: 'RUPE_CANCELADO',
    entityType: 'quota_rupe',
    entityId: rupe.id,
    details: { rupeCode: rupe.rupe_code },
  });
  const updated = db.prepare(`SELECT * FROM quota_rupes WHERE id = ?`).get(rupe.id) as Record<string, unknown>;
  void syncSingleEntityToSupabase('quota_rupes', [updated], 'id');
  return NextResponse.json({ success: true, rupe: updated });
}
