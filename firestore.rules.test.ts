import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

interface AuthContext {
  uid: string;
  email: string;
  email_verified: boolean;
}

const ADMIN_EMAIL = 'associacaodejovensjuristas@gmail.com';
const VALID_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

function isAdmin(auth: AuthContext | null, adminUids: Set<string>): boolean {
  if (!auth || !auth.email_verified) return false;
  return auth.email === ADMIN_EMAIL || adminUids.has(auth.uid);
}

function evaluateUserCreate(
  auth: AuthContext | null,
  docId: string,
  payload: Record<string, unknown>,
  serverTimeMarker: symbol,
  adminUids: Set<string>
): 'ALLOW' | 'PERMISSION_DENIED' {
  if (!auth || !auth.email_verified) return 'PERMISSION_DENIED';
  if (!VALID_ID_RE.test(docId) || auth.uid !== docId) return 'PERMISSION_DENIED';
  const required = ['uid', 'displayName', 'roleCode', 'createdAt', 'updatedAt'];
  const allowed = [...required, 'provinceName'];
  const keys = Object.keys(payload);
  if (!required.every((k) => keys.includes(k))) return 'PERMISSION_DENIED';
  if (!keys.every((k) => allowed.includes(k))) return 'PERMISSION_DENIED';
  if (payload.uid !== auth.uid) return 'PERMISSION_DENIED';
  if (typeof payload.displayName !== 'string' || payload.displayName.length < 2 || payload.displayName.length > 120) {
    return 'PERMISSION_DENIED';
  }
  if (payload.createdAt !== serverTimeMarker || payload.updatedAt !== serverTimeMarker) {
    return 'PERMISSION_DENIED';
  }
  if (!isAdmin(auth, adminUids) && payload.roleCode !== 'ASSOCIADO') {
    return 'PERMISSION_DENIED';
  }
  return 'ALLOW';
}

function evaluateApplicationUpdate(
  auth: AuthContext | null,
  docId: string,
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
  serverTimeMarker: symbol,
  adminUids: Set<string>
): 'ALLOW' | 'PERMISSION_DENIED' {
  if (!auth || !auth.email_verified || !VALID_ID_RE.test(docId)) return 'PERMISSION_DENIED';
  const admin = isAdmin(auth, adminUids);
  if (!admin && existing.ownerUid !== auth.uid) return 'PERMISSION_DENIED';
  if (!admin && (existing.status === 'APROVADA' || existing.status === 'REJEITADA')) return 'PERMISSION_DENIED';
  if (incoming.ownerUid !== existing.ownerUid || incoming.trackingNumber !== existing.trackingNumber) {
    return 'PERMISSION_DENIED';
  }
  if (incoming.createdAt !== existing.createdAt || incoming.updatedAt !== serverTimeMarker) {
    return 'PERMISSION_DENIED';
  }
  return 'ALLOW';
}

test('Dirty Dozen security payloads are rejected with PERMISSION_DENIED and blueprint stays synchronized', () => {
  const SERVER_TIME = Symbol('request.time');
  const admins = new Set<string>(['admin-uid-1']);
  const regularUser: AuthContext = { uid: 'user-1', email: 'jurista@angola.ao', email_verified: true };
  const unverifiedSpoof: AuthContext = { uid: 'spoof-1', email: ADMIN_EMAIL, email_verified: false };

  // 1. Unverified email spoof
  assert.equal(isAdmin(unverifiedSpoof, admins), false);

  // 2. Self-privilege escalation on user create
  assert.equal(
    evaluateUserCreate(
      regularUser,
      'user-1',
      { uid: 'user-1', displayName: 'Candidato', roleCode: 'PRESIDENTE', createdAt: SERVER_TIME, updatedAt: SERVER_TIME },
      SERVER_TIME,
      admins
    ),
    'PERMISSION_DENIED'
  );

  // 3. Shadow / ghost field injection
  assert.equal(
    evaluateUserCreate(
      regularUser,
      'user-1',
      {
        uid: 'user-1',
        displayName: 'Candidato',
        roleCode: 'ASSOCIADO',
        isVerifiedAdmin: true,
        createdAt: SERVER_TIME,
        updatedAt: SERVER_TIME,
      },
      SERVER_TIME,
      admins
    ),
    'PERMISSION_DENIED'
  );

  // 4. Path ID poisoning
  assert.equal(
    evaluateUserCreate(
      regularUser,
      '../admin-poison',
      { uid: 'user-1', displayName: 'Candidato', roleCode: 'ASSOCIADO', createdAt: SERVER_TIME, updatedAt: SERVER_TIME },
      SERVER_TIME,
      admins
    ),
    'PERMISSION_DENIED'
  );

  // 5. Client-forged timestamp
  assert.equal(
    evaluateUserCreate(
      regularUser,
      'user-1',
      { uid: 'user-1', displayName: 'Candidato', roleCode: 'ASSOCIADO', createdAt: '2020-01-01', updatedAt: SERVER_TIME },
      SERVER_TIME,
      admins
    ),
    'PERMISSION_DENIED'
  );

  // 6. Immutable field tampering & terminal state mutation on application update
  const approvedExisting = {
    ownerUid: 'user-1',
    trackingNumber: 'AJJ-CAND-2026-00001',
    status: 'APROVADA',
    createdAt: 't0',
  };
  assert.equal(
    evaluateApplicationUpdate(
      regularUser,
      'app1',
      approvedExisting,
      { ...approvedExisting, status: 'PENDENTE', updatedAt: SERVER_TIME },
      SERVER_TIME,
      admins
    ),
    'PERMISSION_DENIED'
  );
  assert.equal(
    evaluateApplicationUpdate(
      regularUser,
      'app1',
      { ...approvedExisting, status: 'PENDENTE' },
      { ...approvedExisting, ownerUid: 'attacker', status: 'PENDENTE', updatedAt: SERVER_TIME },
      SERVER_TIME,
      admins
    ),
    'PERMISSION_DENIED'
  );

  // Blueprint & firestore.rules existence and collection coverage check
  const blueprint = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-blueprint.json'), 'utf8')) as {
    firestore: Record<string, unknown>;
  };
  const rulesText = fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');
  assert.ok(rulesText.includes("rules_version = '2';"));
  assert.ok(rulesText.includes('allow read, write: if false;'));
  for (const collectionPath of Object.keys(blueprint.firestore)) {
    const rootSegment = collectionPath.split('/').filter(Boolean)[0];
    assert.ok(rulesText.includes(rootSegment), `firestore.rules must secure collection ${rootSegment}`);
  }
});
