import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from './db';
import {
  buildCandidateRegistrationSmsMessage,
  buildCandidateStatusSmsMessage,
  maskPhoneNumber,
  normalizeAngolaPhoneE164,
  resendSmsLog,
  sendAndLogSms,
} from './sms';

test('Angola phone normalization handles local 9-digit, 244 prefix, and +244 formats', () => {
  const local = normalizeAngolaPhoneE164('923 456 789');
  assert.equal(local.ok, true);
  assert.equal(local.e164, '+244923456789');

  const prefix = normalizeAngolaPhoneE164('00244 912-345-678');
  assert.equal(prefix.ok, true);
  assert.equal(prefix.e164, '+244912345678');

  const intl = normalizeAngolaPhoneE164('+244 934 111 222');
  assert.equal(intl.ok, true);
  assert.equal(intl.e164, '+244934111222');

  const invalidAo = normalizeAngolaPhoneE164('+244 923 12');
  assert.equal(invalidAo.ok, false);
  assert.ok(invalidAo.error);

  assert.equal(maskPhoneNumber('+244923456789'), '+244923***789');
});

test('Candidate SMS templates include tracking number, province, and permanent code when approved', () => {
  const regMsg = buildCandidateRegistrationSmsMessage({
    fullName: 'Maria João Baptista',
    trackingNumber: 'AJJ-CAND-2026-00014',
    provinceName: 'Luanda',
    categoryName: 'Associado Simples',
  });
  assert.ok(regMsg.includes('Maria'));
  assert.ok(regMsg.includes('AJJ-CAND-2026-00014'));
  assert.ok(regMsg.includes('Luanda'));

  const approvedMsg = buildCandidateStatusSmsMessage({
    fullName: 'Maria João Baptista',
    trackingNumber: 'AJJ-CAND-2026-00014',
    status: 'APROVADA',
    memberCode: 'AJJ-LUA-2026-00007',
  });
  assert.ok(approvedMsg.includes('AJJ-LUA-2026-00007'));
});

test('sendAndLogSms records local outbox dispatch when no gateway credentials are configured and supports resend', async () => {
  const db = createTestDb();
  const prevWebhook = process.env.SMS_WEBHOOK_URL;
  delete process.env.SMS_WEBHOOK_URL;

  try {
    const result = await sendAndLogSms(db, {
      recipientName: 'António Manuel',
      recipientPhone: '923 888 777',
      message: 'AJJ Angola: Candidatura AJJ-CAND-2026-00001 recebida.',
      category: 'CANDIDATURA_SUBMETIDA',
      relatedEntity: 'application',
      relatedId: 'AJJ-CAND-2026-00001',
    });

    assert.equal(result.status, 'ENFILEIRADO_LOCAL');
    assert.equal(result.provider, 'SGAJJ_OUTBOX_LOCAL');
    assert.equal(result.phoneE164, '+244923888777');

    const row = db.prepare('SELECT * FROM sms_logs WHERE id = ?').get(result.logId) as {
      attempts: number;
      phone_e164: string;
      status: string;
    };
    assert.equal(row.attempts, 1);
    assert.equal(row.phone_e164, '+244923888777');
    assert.equal(row.status, 'ENFILEIRADO_LOCAL');

    const resent = await resendSmsLog(db, result.logId);
    assert.ok(resent);
    const afterResend = db.prepare('SELECT attempts FROM sms_logs WHERE id = ?').get(result.logId) as {
      attempts: number;
    };
    assert.equal(afterResend.attempts, 2);
  } finally {
    if (prevWebhook !== undefined) process.env.SMS_WEBHOOK_URL = prevWebhook;
  }
});

test('sendAndLogSms dispatches via HTTP webhook when SMS_WEBHOOK_URL is configured', async () => {
  const db = createTestDb();
  const prevWebhook = process.env.SMS_WEBHOOK_URL;
  process.env.SMS_WEBHOOK_URL = 'https://sms.example.ao/send';

  let calledUrl = '';
  let calledPayload = '';
  const mockFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calledUrl = String(url);
    calledPayload = String(init?.body || '');
    return new Response(JSON.stringify({ id: 'gw-msg-991' }), { status: 200 });
  }) as typeof fetch;

  try {
    const res = await sendAndLogSms(db, {
      recipientName: 'Helena Mateus',
      recipientPhone: '+244 924 555 111',
      message: 'Candidatura concluída com sucesso.',
      category: 'CANDIDATURA_SUBMETIDA',
      relatedEntity: 'application',
      relatedId: 'AJJ-CAND-2026-00002',
      fetchImpl: mockFetch,
    });

    assert.equal(calledUrl, 'https://sms.example.ao/send');
    assert.ok(calledPayload.includes('+244924555111'));
    assert.equal(res.status, 'ENVIADO_GATEWAY');
    assert.equal(res.provider, 'WEBHOOK_HTTP');
    assert.equal(res.providerMessageId, 'gw-msg-991');
  } finally {
    if (prevWebhook === undefined) delete process.env.SMS_WEBHOOK_URL;
    else process.env.SMS_WEBHOOK_URL = prevWebhook;
  }
});
