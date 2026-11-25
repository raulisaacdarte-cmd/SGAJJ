import { NextRequest, NextResponse } from 'next/server';
import { saveUploadedFile } from '@/lib/uploads';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const folder = String(formData.get('folder') || 'general').replace(/[^a-zA-Z0-9_-]/g, '');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Nenhum ficheiro enviado.' }, { status: 400 });
    }

    const saved = await saveUploadedFile(file, folder || 'general');
    return NextResponse.json({ success: true, ...saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao carregar ficheiro.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
