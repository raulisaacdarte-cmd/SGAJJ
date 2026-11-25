import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const UPLOAD_ROOT = path.join(process.cwd(), 'data', 'uploads');

export function ensureUploadDir(subDir = ''): string {
  const target = subDir ? path.join(UPLOAD_ROOT, subDir) : UPLOAD_ROOT;
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
  return target;
}

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt']);

export async function saveUploadedFile(
  file: File,
  subDir = 'general'
): Promise<{ filePath: string; fileName: string; mimeType: string; fileSize: number }> {
  const maxBytes = 10 * 1024 * 1024; // 10MB
  if (file.size > maxBytes) {
    throw new Error('O ficheiro excede o limite máximo permitido de 10 MB.');
  }

  const origName = file.name || 'documento';
  const ext = path.extname(origName).toLowerCase() || '.bin';
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error('Formato de ficheiro não permitido. Utilize PDF, JPG, PNG, WEBP, DOC/DOCX ou XLS/XLSX.');
  }

  const dir = ensureUploadDir(subDir);
  const safeBase = origName
    .replace(ext, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 40);
  const uniqueName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeBase}${ext}`;
  const fullDiskPath = path.join(dir, uniqueName);

  const arrayBuffer = await file.arrayBuffer();
  fs.writeFileSync(fullDiskPath, Buffer.from(arrayBuffer));

  return {
    filePath: `/api/files/${subDir}/${uniqueName}`,
    fileName: origName,
    mimeType: file.type || 'application/octet-stream',
    fileSize: file.size,
  };
}

export function resolveSafeUploadPath(segments: string[]): string | null {
  const joined = path.join(UPLOAD_ROOT, ...segments);
  const resolved = path.resolve(joined);
  const rootResolved = path.resolve(UPLOAD_ROOT);
  if (!resolved.startsWith(rootResolved + path.sep)) {
    return null;
  }
  if (!fs.existsSync(resolved)) {
    return null;
  }
  return resolved;
}
