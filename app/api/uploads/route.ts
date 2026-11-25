import { NextRequest, NextResponse } from 'next/server';
import { saveUploadedFile } from '@/lib/uploads';
import { uploadFileToSupabaseStorage } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const folder = String(formData.get('folder') || 'general').replace(/[^a-zA-Z0-9_-]/g, '');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Nenhum ficheiro enviado.' }, { status: 400 });
    }

    const saved = await saveUploadedFile(file, folder || 'general');
    const arrayBuffer = await file.arrayBuffer().catch(() => null);
    if (arrayBuffer) {
      void uploadFileToSupabaseStorage({
        storagePath: `${folder || 'general'}/${saved.fileName}`,
        buffer: Buffer.from(arrayBuffer),
        contentType: saved.mimeType,
      });
    }
    return NextResponse.json({ success: true, ...saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao carregar ficheiro.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
