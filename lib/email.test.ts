import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from './db';
import {
  buildInstitutionalActivationEmailHtml,
  dispatchEmailViaGateway,
  getConfiguredEmailProvider,
  isValidEmailAddress,
  maskEmailAddress,
  resendEmailLog,
  sendAndLogEmail,
} from './email';

function withClearedEmailEnv<T>(fn: () => Promise<T> | T): Promise<T> | T {
  const keys = ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'EMAIL_WEBHOOK_URL', 'EMAIL_API_KEY'] as const;
  const saved: Record<string, string | undefined> = {};
  for (const k of keys) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  const restore = () => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  };
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res.finally(restore);
    }
    restore();
    return res;
  } catch (err) {
    restore();
    throw err;
  }
}

test('Email validation and masking behave accurately', () => {
  assert.equal(isValidEmailAddress('diretor@ajj-angola.org'), true);
  assert.equal(isValidEmailAddress('associacaodejovensjuristas@gmail.com'), true);
  assert.equal(isValidEmailAddress('invalido@'), false);
  assert.equal(isValidEmailAddress('sem-arroba.ao'), false);
  assert.equal(maskEmailAddress('coordenador@ajj-angola.org'), 'co***@ajj-angola.org');
});

test('buildInstitutionalActivationEmailHtml escapes HTML injection and formats national vs provincial scope', () => {
  const nationalHtml = buildInstitutionalActivationEmailHtml({
    fullName: 'Dr. <script>alert(1)</script> Mateus',
    activationUrl: 'https://sgajj.ao/ativar?token=nat123',
    kind: 'NOMEACAO',
    roleName: 'Diretor Nacional de Finanças',
    roleScope: 'NATIONAL',
    provinceName: null,
  });

  assert.equal(nationalHtml.includes('<script>'), false);
  assert.ok(nationalHtml.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(nationalHtml.includes('Direção Central da Associação de Jovens Juristas'));
  assert.ok(nationalHtml.includes('https://sgajj.ao/ativar?token=nat123'));

  const provHtml = buildInstitutionalActivationEmailHtml({
    fullName: 'Dra. Ana Silva',
    activationUrl: 'https://sgajj.ao/ativar?token=prov456',
    kind: 'NOMEACAO',
    roleName: 'Coordenador Provincial',
    roleScope: 'PROVINCIAL',
    provinceName: 'Benguela',
    memberCode: 'AJJ-BGU-2026-00004',
    dispatchNumber: 'DESP-BGU-2026-00001',
  });

  assert.ok(provHtml.includes('Benguela'));
  assert.ok(provHtml.includes('AJJ-BGU-2026-00004'));
  assert.ok(provHtml.includes('DESP-BGU-2026-00001'));
});

test('sendAndLogEmail persists to local outbox when no gateway is set and supports resend', async () => {
  await withClearedEmailEnv(async () => {
    const db = createTestDb();
    assert.equal(getConfiguredEmailProvider(), 'SGAJJ_EMAIL_OUTBOX_LOCAL');

    const res = await sendAndLogEmail(db, {
      recipientName: 'Dr. Paulo Cassinda',
      recipientEmail: 'paulo.cassinda@ajj-angola.org',
      subject: 'AJJ — Ativação Direção Central',
      textBody: 'Link: https://sgajj.ao/ativar?token=t1',
      htmlBody: '<p>Link</p>',
      category: 'ATIVACAO_DIRECAO_CENTRAL',
      relatedEntity: 'user',
      relatedId: '9',
    });

    assert.equal(res.status, 'ENFILEIRADO_LOCAL');
    assert.equal(res.provider, 'SGAJJ_EMAIL_OUTBOX_LOCAL');

    const row = db.prepare('SELECT attempts, status FROM email_logs WHERE id = ?').get(res.logId) as {
      attempts: number;
      status: string;
    };
    assert.equal(row.attempts, 1);
    assert.equal(row.status, 'ENFILEIRADO_LOCAL');

    const resent = await resendEmailLog(db, res.logId);
    assert.ok(resent);
    const updated = db.prepare('SELECT attempts FROM email_logs WHERE id = ?').get(res.logId) as {
      attempts: number;
    };
    assert.equal(updated.attempts, 2);
  });
});

test('dispatchEmailViaGateway supports RESEND, SENDGRID, and WEBHOOK_HTTP providers', async () => {
  await withClearedEmailEnv(async () => {
    process.env.RESEND_API_KEY = 're_test_123';
    let targetUrl = '';
    const resendRes = await dispatchEmailViaGateway(
      {
        toEmail: 'coord@ajj-angola.org',
        toName: 'Coordenador Benguela',
        subject: 'Ativação',
        textBody: 'Texto',
        htmlBody: '<p>HTML</p>',
        category: 'NOMEACAO',
      },
      (async (url: string | URL | Request) => {
        targetUrl = String(url);
        return new Response(JSON.stringify({ id: 'resend-id-1' }), { status: 200 });
      }) as typeof fetch
    );
    assert.equal(targetUrl, 'https://api.resend.com/emails');
    assert.equal(resendRes.provider, 'RESEND');
    assert.equal(resendRes.status, 'ENVIADO_GATEWAY');
    assert.equal(resendRes.providerMessageId, 'resend-id-1');

    delete process.env.RESEND_API_KEY;
    process.env.SENDGRID_API_KEY = 'sg_test_456';
    const sgRes = await dispatchEmailViaGateway(
      {
        toEmail: 'dir@ajj-angola.org',
        toName: 'Diretor Central',
        subject: 'Ativação',
        textBody: 'Texto',
        htmlBody: '<p>HTML</p>',
        category: 'ATIVACAO_DIRECAO_CENTRAL',
      },
      (async (url: string | URL | Request) => {
        targetUrl = String(url);
        return new Response('', { status: 202, headers: { 'x-message-id': 'sg-msg-2' } });
      }) as typeof fetch
    );
    assert.equal(targetUrl, 'https://api.sendgrid.com/v3/mail/send');
    assert.equal(sgRes.provider, 'SENDGRID');
    assert.equal(sgRes.status, 'ENVIADO_GATEWAY');
    assert.equal(sgRes.providerMessageId, 'sg-msg-2');

    delete process.env.SENDGRID_API_KEY;
    process.env.EMAIL_WEBHOOK_URL = 'https://mail.example.ao/dispatch';
    process.env.EMAIL_API_KEY = 'hook_key_789';
    let authHeader = '';
    const whRes = await dispatchEmailViaGateway(
      {
        toEmail: 'coord@ajj-angola.org',
        toName: 'Coordenador',
        subject: 'Ativação',
        textBody: 'Texto',
        htmlBody: '<p>HTML</p>',
        category: 'NOMEACAO',
      },
      (async (url: string | URL | Request, init?: RequestInit) => {
        targetUrl = String(url);
        authHeader = (init?.headers as Record<string, string>)?.Authorization || '';
        return new Response(JSON.stringify({ messageId: 'wh-msg-3' }), { status: 200 });
      }) as typeof fetch
    );
    assert.equal(targetUrl, 'https://mail.example.ao/dispatch');
    assert.equal(authHeader, 'Bearer hook_key_789');
    assert.equal(whRes.provider, 'WEBHOOK_HTTP');
    assert.equal(whRes.status, 'ENVIADO_GATEWAY');
    assert.equal(whRes.providerMessageId, 'wh-msg-3');
  });
});
