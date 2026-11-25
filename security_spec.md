# Security Specification — SGAJJ Firestore Rules

## 1. Data Invariants
1. **Default-Deny Safety Net**: Every path not explicitly matched is denied (`match /{document=**} { allow read, write: if false; }`).
2. **Verified Identity Requirement**: All authenticated reads/writes require `request.auth != null && request.auth.token.email_verified == true`.
3. **Admin Escalation Prevention**: Regular users cannot create or modify `/admins/{userId}` or elevate `roleCode` on `/users/{userId}` during creation (`roleCode == 'ASSOCIADO'` enforced for non-admins).
4. **PII Isolation**: Sensitive attributes (`email`, `phone`, `memberCode`) live strictly in `/users/{userId}/private/{docId}` with `get` restricted to `request.auth.uid == userId || isAdmin()` and `list` restricted to `resource.data.uid == request.auth.uid`.
5. **Path ID Poisoning Guard**: Single-document operations validate `isValidId(id)` (`^[a-zA-Z0-9_\-]+$`, max 128 chars), and all strings enforce explicit `.size()` bounds.
6. **Temporal Integrity**: `createdAt` on create and `updatedAt` on update must equal `request.time`.
7. **Terminal State Locking**: Once an `application` reaches `APROVADA` or `REJEITADA`, non-admin owners cannot mutate it.
8. **Query Enforcer (No Blanket Reads / No `get()` in `allow list`)**: Every `allow list` validates `resource.data` directly without delegating filtering to client queries or calling `get()`/`exists()`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unverified Email Spoof**: `{ auth: { uid: "u1", token: { email: "associacaodejovensjuristas@gmail.com", email_verified: false } } }` writing `/public_publications/p1` -> `PERMISSION_DENIED`.
2. **Self-Privilege Escalation on User Creation**: User `u1` creates `/users/u1` with `{ roleCode: "PRESIDENTE" }` -> `PERMISSION_DENIED`.
3. **Ghost / Shadow Field Injection**: User `u1` creates `/users/u1` with `{ ..., isVerifiedAdmin: true }` -> `PERMISSION_DENIED` (`hasOnly` rejects unknown keys).
4. **Admin Marker Forgery**: Non-admin `u1` creates `/admins/u1` -> `PERMISSION_DENIED`.
5. **Cross-Tenant PII Read (`get`)**: Authenticated user `u2` reads `/users/u1/private/info` -> `PERMISSION_DENIED`.
6. **Blanket User List Scraping (`list`)**: Authenticated user `u2` queries `/users` without `where('uid', '==', 'u2')` -> `PERMISSION_DENIED`.
7. **Path ID Poisoning**: Request targeting `/users/` + 200-char ID or invalid characters `../admin` -> `PERMISSION_DENIED`.
8. **String Size Exhaustion (Denial of Wallet)**: Creating `/public_publications/p1` with `summary` > 600 chars -> `PERMISSION_DENIED`.
9. **Client-Forged Timestamp**: Creating `/applications/app1` with `createdAt` in the past instead of `request.time` -> `PERMISSION_DENIED`.
10. **Immutable Field Tampering**: Updating `/applications/app1` to change `ownerUid` or `trackingNumber` -> `PERMISSION_DENIED`.
11. **Terminal State Mutation**: Owner tries to update `/applications/app1` from `APROVADA` back to `PENDENTE` -> `PERMISSION_DENIED`.
12. **Draft Leak in Public List**: Anonymous or non-admin user lists `/public_publications` including `status: 'RASCUNHO'` -> `PERMISSION_DENIED`.
