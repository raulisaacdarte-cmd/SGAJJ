import { NextRequest, NextResponse } from 'next/server';
import { getDb, getNextSequence, writeAuditLog } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import {
  calculateQuotaCompliance,
  generateReceiptNumber,
  hasPermission,
  isCentralDirectorate,
} from '@/lib/domain';

export async function GET(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse || !user) return errorResponse!;

  const db = getDb();
  const { searchParams } = new URL(req.url);
  const scopeFilter = searchParams.get('scope');
  const provinceId = searchParams.get('provinceId');
  const period = searchParams.get('period'); // MENSAL | TRIMESTRAL | ANUAL

  const canNational = hasPermission(user.role_code, 'MANAGE_NATIONAL_FINANCE') || isCentralDirectorate(user.role_code);
  const canProvincial = hasPermission(user.role_code, 'MANAGE_PROVINCIAL_FINANCE');

  // If simple Associate, return only their personal financial quota history
  if (!canNational && !canProvincial) {
    const personalQuotas = user.member_id
      ? db.prepare(`SELECT * FROM quotas WHERE member_id = ? ORDER BY reference_month DESC`).all(user.member_id)
      : [];
    const personalTx = user.member_id
      ? db.prepare(`SELECT * FROM financial_transactions WHERE member_id = ? ORDER BY reference_date DESC`).all(user.member_id)
      : [];
    return NextResponse.json({
      accounts: [],
      transactions: personalTx,
      quotas: personalQuotas,
      delinquency: [],
      summary: { totalRevenue: 0, totalExpenses: 0, netBalance: 0, pendingApprovalCount: 0 },
    });
  }

  let accSql = `SELECT fa.*, p.name as province_name FROM financial_accounts fa LEFT JOIN provinces p ON p.id = fa.province_id WHERE 1=1`;
  const accParams: unknown[] = [];
  if (!canNational) {
    accSql += ` AND fa.scope = 'PROVINCIAL' AND fa.province_id = ?`;
    accParams.push(user.province_id);
  }
  const accounts = db.prepare(accSql + ` ORDER BY fa.scope ASC, fa.name ASC`).all(...accParams);

  let txSql = `
    SELECT ft.*, p.name as province_name, fa.name as account_name,
           u_c.full_name as created_by_name, u_a.full_name as approved_by_name,
           m.full_name as member_name, m.member_code
    FROM financial_transactions ft
    JOIN financial_accounts fa ON fa.id = ft.account_id
    LEFT JOIN provinces p ON p.id = ft.province_id
    LEFT JOIN users u_c ON u_c.id = ft.created_by
    LEFT JOIN users u_a ON u_a.id = ft.approved_by
    LEFT JOIN members m ON m.id = ft.member_id
    WHERE 1=1
  `;
  const txParams: unknown[] = [];

  if (!canNational) {
    txSql += ` AND ft.scope = 'PROVINCIAL' AND ft.province_id = ?`;
    txParams.push(user.province_id);
  } else {
    if (scopeFilter) {
      txSql += ` AND ft.scope = ?`;
      txParams.push(scopeFilter);
    }
    if (provinceId) {
      txSql += ` AND ft.province_id = ?`;
      txParams.push(Number(provinceId));
    }
  }

  if (period === 'MENSAL') {
    txSql += ` AND ft.reference_date >= date('now', 'start of month')`;
  } else if (period === 'TRIMESTRAL') {
    txSql += ` AND ft.reference_date >= date('now', '-3 months')`;
  } else if (period === 'ANUAL') {
    txSql += ` AND ft.reference_date >= date('now', 'start of year')`;
  }

  txSql += ` ORDER BY ft.reference_date DESC, ft.id DESC`;
  const transactions = db.prepare(txSql).all(...txParams) as Array<{
    type: string;
    amount_aoa: number;
    status: string;
  }>;

  let qSql = `
    SELECT q.*, m.full_name as member_name, m.member_code, p.name as province_name
    FROM quotas q
    JOIN members m ON m.id = q.member_id
    JOIN provinces p ON p.id = q.province_id
    WHERE 1=1
  `;
  const qParams: unknown[] = [];
  if (!canNational) {
    qSql += ` AND q.province_id = ?`;
    qParams.push(user.province_id);
  } else if (provinceId) {
    qSql += ` AND q.province_id = ?`;
    qParams.push(Number(provinceId));
  }
  const quotas = db.prepare(qSql + ` ORDER BY q.reference_month DESC, q.id DESC LIMIT 200`).all(...qParams);

  // Compute delinquency across active members
  let memSql = `
    SELECT m.id, m.member_code, m.full_name, m.joined_at, p.name as province_name,
           mc.name as category_name, mc.monthly_quota_aoa,
           (SELECT COUNT(*) FROM quotas q WHERE q.member_id = m.id AND q.status = 'PAGO') as paid_count
    FROM members m
    JOIN provinces p ON p.id = m.province_id
    JOIN member_categories mc ON mc.id = m.category_id
    WHERE m.status = 'ATIVO' AND mc.monthly_quota_aoa > 0
  `;
  const memParams: unknown[] = [];
  if (!canNational && user.province_id) {
    memSql += ` AND m.province_id = ?`;
    memParams.push(user.province_id);
  }
  const activeMembers = db.prepare(memSql).all(...memParams) as Array<{
    id: number;
    member_code: string;
    full_name: string;
    joined_at: string;
    province_name: string;
    category_name: string;
    monthly_quota_aoa: number;
    paid_count: number;
  }>;

  const now = new Date();
  const delinquency = activeMembers.map((m) => {
    const joined = new Date(m.joined_at);
    const monthsSinceJoin = Math.max(
      1,
      (now.getUTCFullYear() - joined.getUTCFullYear()) * 12 + (now.getUTCMonth() - joined.getUTCMonth()) + 1
    );
    const calc = calculateQuotaCompliance(monthsSinceJoin, m.paid_count, m.monthly_quota_aoa);
    return {
      member_id: m.id,
      member_code: m.member_code,
      full_name: m.full_name,
      province_name: m.province_name,
      category_name: m.category_name,
      monthly_quota_aoa: m.monthly_quota_aoa,
      expected_months: monthsSinceJoin,
      paid_months: m.paid_count,
      ...calc,
    };
  });

  const totalRevenue = transactions
    .filter((t) => t.status === 'APROVADO' && t.type !== 'DESPESA')
    .reduce((acc, t) => acc + t.amount_aoa, 0);
  const totalExpenses = transactions
    .filter((t) => t.status === 'APROVADO' && t.type === 'DESPESA')
    .reduce((acc, t) => acc + t.amount_aoa, 0);
  const pendingApprovalCount = transactions.filter((t) => t.status === 'PENDENTE_APROVACAO').length;

  return NextResponse.json({
    accounts,
    transactions,
    quotas,
    delinquency,
    summary: {
      totalRevenue,
      totalExpenses,
      netBalance: totalRevenue - totalExpenses,
      pendingApprovalCount,
    },
  });
}

export async function POST(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse || !user) return errorResponse!;

  const canNational = hasPermission(user.role_code, 'MANAGE_NATIONAL_FINANCE');
  const canProvincial = hasPermission(user.role_code, 'MANAGE_PROVINCIAL_FINANCE');
  if (!canNational && !canProvincial) {
    return NextResponse.json({ error: 'Sem permissão para registar movimentos financeiros.' }, { status: 403 });
  }

  const body = await req.json();
  const {
    scope,
    province_id,
    type,
    category,
    description,
    amount_aoa,
    reference_date,
    member_id,
    reference_month,
    bank_code,
    payment_channel,
  } = body;

  const numericAmount = Number(amount_aoa);
  if (!type || !description?.trim() || !numericAmount || numericAmount <= 0) {
    return NextResponse.json({ error: 'Tipo, descrição e montante positivo são obrigatórios.' }, { status: 400 });
  }

  const effectiveScope = canNational && scope === 'NACIONAL' ? 'NACIONAL' : 'PROVINCIAL';
  const effectiveProvinceId =
    effectiveScope === 'NACIONAL' ? null : canNational && province_id ? Number(province_id) : user.province_id;

  if (effectiveScope === 'PROVINCIAL' && !effectiveProvinceId) {
    return NextResponse.json({ error: 'Selecione a província para conta provincial.' }, { status: 400 });
  }

  const db = getDb();
  const account = db.prepare(
    effectiveScope === 'NACIONAL'
      ? `SELECT id FROM financial_accounts WHERE scope = 'NACIONAL' LIMIT 1`
      : `SELECT id FROM financial_accounts WHERE scope = 'PROVINCIAL' AND province_id = ? LIMIT 1`
  ).get(...(effectiveScope === 'NACIONAL' ? [] : [effectiveProvinceId])) as { id: number } | undefined;

  if (!account) {
    return NextResponse.json({ error: 'Conta financeira não localizada.' }, { status: 404 });
  }

  const year = new Date().getFullYear();
  const canAutoApprove = hasPermission(user.role_code, 'APPROVE_EXPENSES') || type !== 'DESPESA';
  const initialStatus = canAutoApprove ? 'APROVADO' : 'PENDENTE_APROVACAO';

  const res = db.transaction(() => {
    const seq = getNextSequence(db, `REC_${year}`);
    const receiptNumber = generateReceiptNumber(year, seq);
    const refDate = reference_date || new Date().toISOString().slice(0, 10);

    const txRes = db.prepare(`
      INSERT INTO financial_transactions (
        account_id, province_id, scope, type, category, description, amount_aoa,
        reference_date, receipt_number, status, approved_by, approved_at,
        bank_code, payment_channel, member_id, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      account.id,
      effectiveProvinceId,
      effectiveScope,
      type,
      category?.trim() || type,
      description.trim(),
      numericAmount,
      refDate,
      receiptNumber,
      initialStatus,
      canAutoApprove ? user.id : null,
      canAutoApprove ? new Date().toISOString() : null,
      String(bank_code || '').trim(),
      String(payment_channel || '').trim(),
      member_id ? Number(member_id) : null,
      user.id
    );

    if (initialStatus === 'APROVADO') {
      const delta = type === 'DESPESA' ? -numericAmount : numericAmount;
      db.prepare(`UPDATE financial_accounts SET balance_aoa = balance_aoa + ?, updated_at = datetime('now') WHERE id = ?`).run(
        delta,
        account.id
      );
    }

    if (type === 'QUOTA' && member_id) {
      const monthStr = reference_month || refDate.slice(0, 7);
      const mem = db.prepare(`SELECT province_id FROM members WHERE id = ?`).get(Number(member_id)) as
        | { province_id: number }
        | undefined;
      if (mem) {
        db.prepare(`
          INSERT INTO quotas (member_id, province_id, reference_month, amount_aoa, status, paid_at, receipt_number, recorded_by)
          VALUES (?, ?, ?, ?, 'PAGO', datetime('now'), ?, ?)
          ON CONFLICT(member_id, reference_month) DO UPDATE SET
            status = 'PAGO', amount_aoa = excluded.amount_aoa, paid_at = datetime('now'), receipt_number = excluded.receipt_number
        `).run(Number(member_id), mem.province_id, monthStr, numericAmount, receiptNumber, user.id);
      }
    }

    writeAuditLog(db, {
      userId: user.id,
      userName: user.full_name,
      roleCode: user.role_code,
      action: `FINANCEIRO_${type}_REGISTADO`,
      entityType: 'financial_transaction',
      entityId: Number(txRes.lastInsertRowid),
      details: { receiptNumber, amount_aoa: numericAmount, scope: effectiveScope, status: initialStatus },
    });

    return { id: Number(txRes.lastInsertRowid), receipt_number: receiptNumber, status: initialStatus };
  })();

  return NextResponse.json({ success: true, ...res });
}

export async function PATCH(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse || !user) return errorResponse!;

  const { id, action } = await req.json();
  if (!id || !['APROVAR', 'REJEITAR', 'ANULAR'].includes(action)) {
    return NextResponse.json({ error: 'Operação financeira inválida.' }, { status: 400 });
  }

  if ((action === 'APROVAR' || action === 'REJEITAR') && !hasPermission(user.role_code, 'APPROVE_EXPENSES')) {
    return NextResponse.json({ error: 'Apenas o Presidente pode aprovar ou rejeitar despesas.' }, { status: 403 });
  }
  if (action === 'ANULAR' && !hasPermission(user.role_code, 'MANAGE_NATIONAL_FINANCE')) {
    return NextResponse.json({ error: 'Sem permissão para anular lançamentos.' }, { status: 403 });
  }

  const db = getDb();
  const txRow = db.prepare(`SELECT * FROM financial_transactions WHERE id = ?`).get(Number(id)) as
    | { id: number; account_id: number; type: string; amount_aoa: number; status: string; receipt_number: string }
    | undefined;
  if (!txRow) {
    return NextResponse.json({ error: 'Movimento não encontrado.' }, { status: 404 });
  }

  db.transaction(() => {
    if (action === 'APROVAR' && txRow.status === 'PENDENTE_APROVACAO') {
      db.prepare(`
        UPDATE financial_transactions
        SET status = 'APROVADO', approved_by = ?, approved_at = datetime('now')
        WHERE id = ?
      `).run(user.id, txRow.id);
      const delta = txRow.type === 'DESPESA' ? -txRow.amount_aoa : txRow.amount_aoa;
      db.prepare(`UPDATE financial_accounts SET balance_aoa = balance_aoa + ?, updated_at = datetime('now') WHERE id = ?`).run(
        delta,
        txRow.account_id
      );
    } else if (action === 'REJEITAR' && txRow.status === 'PENDENTE_APROVACAO') {
      db.prepare(`
        UPDATE financial_transactions
        SET status = 'REJEITADO', approved_by = ?, approved_at = datetime('now')
        WHERE id = ?
      `).run(user.id, txRow.id);
    } else if (action === 'ANULAR' && txRow.status !== 'ANULADO') {
      if (txRow.status === 'APROVADO') {
        const reverseDelta = txRow.type === 'DESPESA' ? txRow.amount_aoa : -txRow.amount_aoa;
        db.prepare(`UPDATE financial_accounts SET balance_aoa = balance_aoa + ?, updated_at = datetime('now') WHERE id = ?`).run(
          reverseDelta,
          txRow.account_id
        );
      }
      db.prepare(`UPDATE financial_transactions SET status = 'ANULADO' WHERE id = ?`).run(txRow.id);
    }

    writeAuditLog(db, {
      userId: user.id,
      userName: user.full_name,
      roleCode: user.role_code,
      action: `FINANCEIRO_${action}`,
      entityType: 'financial_transaction',
      entityId: txRow.id,
      details: { receiptNumber: txRow.receipt_number, previousStatus: txRow.status },
    });
  })();

  return NextResponse.json({ success: true });
}
