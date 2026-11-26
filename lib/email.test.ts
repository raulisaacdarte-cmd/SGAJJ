import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { createTestDb } from './db';
import {
  buildInstitutionalActivationEmailHtml,
  buildInstitutionalTestEmailHtml,
  dispatchEmailViaGateway,
  getConfiguredEmailProvider,
  getEmailGatewayDiagnostics,
  isValidEmailAddress,
  maskEmailAddress,
  resendEmailLog,
  sendAndLogEmail,
} from './email';

function withClearedEmailEnv<T>(fn: () => Promise<T> | T): Promise<T> | T {
  const keys = [
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_SECURE',
    'SMTP_USER',
    'SMTP_PASS',
    'RESEND_API_KEY',
    'SENDGRID_API_KEY',
    'EMAIL_WEBHOOK_URL',
    'EMAIL_API_KEY',
  ] as const;
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
  assert.ok(provHtml.includes('ATIVAR MINHA CONTA'));

  const registrationHtml = buildInstitutionalActivationEmailHtml({
    fullName: 'Helena Mateus',
    activationUrl: 'https://sgajj.ao/ativar?token=insc123',
    kind: 'ADESAO',
    phase: 'INSCRICAO',
    trackingNumber: 'AJJ-CAND-2026-00019',
    provinceName: 'Luanda',
  });
  assert.ok(registrationHtml.includes('ATIVAR MINHA CONTA'));
  assert.ok(registrationHtml.includes('AJJ-CAND-2026-00019'));
  assert.ok(registrationHtml.includes('Recebemos a sua inscrição'));
  assert.ok(registrationHtml.includes('https://sgajj.ao/ativar?token=insc123'));
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

test('sendAndLogEmail delivers real SMTP message over TCP when SMTP_HOST is configured', async () => {
  await withClearedEmailEnv(async () => {
    let receivedPayload = '';
    const server = net.createServer((socket) => {
      socket.write('220 localhost ESMTP SGAJJ-Test\r\n');
      let inData = false;
      let buffer = '';
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        if (inData) {
          if (buffer.includes('\r\n.\r\n')) {
            receivedPayload += buffer;
            inData = false;
            buffer = '';
            socket.write('250 2.0.0 Ok: queued\r\n');
          }
          return;
        }
        const lines = buffer.split('\r\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const upper = line.toUpperCase();
          if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
            socket.write('250-localhost\r\n250 OK\r\n');
          } else if (upper.startsWith('MAIL FROM:')) {
            socket.write('250 2.1.0 Ok\r\n');
          } else if (upper.startsWith('RCPT TO:')) {
            socket.write('250 2.1.5 Ok\r\n');
          } else if (upper === 'DATA') {
            inData = true;
            socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
            if (buffer.includes('\r\n.\r\n')) {
              receivedPayload += buffer;
              inData = false;
              buffer = '';
              socket.write('250 2.0.0 Ok: queued\r\n');
            }
          } else if (upper === 'QUIT') {
            socket.write('221 2.0.0 Bye\r\n');
            socket.end();
          } else {
            socket.write('250 OK\r\n');
          }
        }
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    assert.ok(address && typeof address === 'object');

    try {
      process.env.SMTP_HOST = '127.0.0.1';
      process.env.SMTP_PORT = String(address.port);
      process.env.SMTP_SECURE = 'false';

      const db = createTestDb();
      const url = 'https://sgajj.ao/ativar?token=smtpToken999';
      const html = buildInstitutionalActivationEmailHtml({
        fullName: 'Dr. Mateus Baptista',
        activationUrl: url,
        kind: 'ADESAO',
        phase: 'INSCRICAO',
        trackingNumber: 'AJJ-CAND-2026-00088',
        provinceName: 'Huambo',
      });

      const res = await sendAndLogEmail(db, {
        recipientName: 'Dr. Mateus Baptista',
        recipientEmail: 'mateus.baptista@ajj-angola.org',
        subject: 'Associação de Jovens Juristas (AJJ) — Inscrição Recebida · ATIVAR MINHA CONTA',
        textBody: `ATIVAR MINHA CONTA: ${url}`,
        htmlBody: html,
        category: 'ATIVACAO_INSCRICAO',
        relatedEntity: 'application',
        relatedId: 'AJJ-CAND-2026-00088',
      });

      assert.equal(res.provider, 'SMTP');
      assert.equal(res.status, 'ENVIADO_GATEWAY');
      assert.ok(receivedPayload.includes('ATIVAR MINHA CONTA'));
      assert.ok(receivedPayload.includes('smtpToken999'));
    } finally {
      server.close();
    }
  });
});

test('getEmailGatewayDiagnostics and buildInstitutionalTestEmailHtml report safe non-secret state', () => {
  return withClearedEmailEnv(() => {
    const localDiag = getEmailGatewayDiagnostics();
    assert.equal(localDiag.provider, 'SGAJJ_EMAIL_OUTBOX_LOCAL');
    assert.equal(localDiag.gatewayConfigured, false);
    assert.equal(localDiag.smtpHost, null);

    process.env.SMTP_HOST = 'smtp.gmail.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'associacaodejovensjuristas@gmail.com';
    process.env.SMTP_PASS = 'secret-app-password-never-exposed';

    const smtpDiag = getEmailGatewayDiagnostics();
    assert.equal(smtpDiag.provider, 'SMTP');
    assert.equal(smtpDiag.gatewayConfigured, true);
    assert.equal(smtpDiag.fromEmail, 'associacaodejovensjuristas@gmail.com');
    assert.equal(smtpDiag.smtpHost, 'smtp.gmail.com');
    assert.equal(smtpDiag.smtpPort, 587);
    assert.equal(smtpDiag.smtpAuthConfigured, true);
    assert.equal(JSON.stringify(smtpDiag).includes('secret-app-password-never-exposed'), false);

    const html = buildInstitutionalTestEmailHtml({
      recipientName: 'Presidente <AJJ>',
      provider: smtpDiag.provider,
      fromEmail: smtpDiag.fromEmail,
      sentAtIso: '2026-11-26T10:00:00.000Z',
    });
    assert.ok(html.includes('Presidente &lt;AJJ&gt;'));
    assert.ok(html.includes('SMTP'));
    assert.ok(html.includes('associacaodejovensjuristas@gmail.com'));
  });
});

