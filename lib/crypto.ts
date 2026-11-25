import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const FALLBACK_DEV_SECRET = 'sgajj-angola-institutional-key-2026-default';

function getEncryptionKey(): Buffer {
  const raw = process.env.DATA_ENCRYPTION_KEY || process.env.SESSION_SECRET || FALLBACK_DEV_SECRET;
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptSensitive(plainText: string | null | undefined): string | null {
  if (!plainText) return null;
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSensitive(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const parts = payload.split(':');
  if (parts.length !== 3) return payload;
  try {
    const [ivB64, tagB64, dataB64] = parts;
    const key = getEncryptionKey();
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    const encrypted = Buffer.from(dataB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function hashToken(token: string): string {
  const secret = process.env.SESSION_SECRET || FALLBACK_DEV_SECRET;
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

export function generateSixDigitCode(): string {
  return String(crypto.randomInt(100000, 999999));
}
