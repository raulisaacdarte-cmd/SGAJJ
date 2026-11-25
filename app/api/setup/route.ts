import { NextRequest, NextResponse } from 'next/server';
import { getDb, writeAuditLog, createNotification, applyInitialStructure } from '@/lib/db';
import { hashPassword } from '@/lib/crypto';
import { createUserSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import {
  CORE_STATUTORY_DEPARTMENT_CODES,
  validateInitialStructure,
  type SetupProvinceInput,
  type SetupDepartmentInput,
} from '@/lib/domain';

export async function GET() {
  const db = getDb();
  const settings = db.prepare(`SELECT * FROM system_settings WHERE id = 1`).get() as {
    setup_completed: number;
    organization_name: string;
    acronym: string;
    slogan: string;
    logo_path: string;
    headquarters_address: string;
    contact_email: string;
    contact_phone: string;
    nif: string;
  };
  const usersCount = (db.prepare(`SELECT COUNT(*) as c FROM users`).get() as { c: number }).c;
  const presidentExists =
    (db.prepare(`SELECT COUNT(*) as c FROM users WHERE role_code = 'PRESIDENTE'`).get() as { c: number }).c > 0;

  const provinces = db
    .prepare(
      `SELECT p.id, p.code, p.name, p.is_active,
              (SELECT COUNT(*) FROM municipalities m WHERE m.province_id = p.id) as municipalities_count
       FROM provinces p
       ORDER BY p.name ASC`
    )
    .all();

  const departments = db.prepare(`SELECT id, code, name, description FROM departments ORDER BY id ASC`).all() as Array<{
    id: number;
    code: string;
    name: string;
    description: string;
  }>;

  return NextResponse.json({
    setupCompleted: settings.setup_completed === 1 && presidentExists,
    usersCount,
    presidentExists,
    settings,
    provinces,
    departments: departments.map((d) => ({
      ...d,
      is_core: CORE_STATUTORY_DEPARTMENT_CODES.has(d.code),
    })),
  });
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const presidentExists =
    (db.prepare(`SELECT COUNT(*) as c FROM users WHERE role_code = 'PRESIDENTE'`).get() as { c: number }).c > 0;
  if (presidentExists) {
    return NextResponse.json(
      { error: 'A configuração inicial da Presidência já foi concluída.' },
      { status: 409 }
    );
  }

  const body = await req.json();
  const {
    organization_name,
    acronym,
    slogan,
    nif,
    headquarters_address,
    contact_email,
    contact_phone,
    logo_path,
    president_name,
    president_email,
    president_phone,
    president_password,
    enable_mfa,
    seed_inaugural_content,
    provinces,
    departments,
  } = body as {
    organization_name?: string;
    acronym?: string;
    slogan?: string;
    nif?: string;
    headquarters_address?: string;
    contact_email?: string;
    contact_phone?: string;
    logo_path?: string;
    president_name?: string;
    president_email?: string;
    president_phone?: string;
    president_password?: string;
    enable_mfa?: boolean;
    seed_inaugural_content?: boolean;
    provinces?: SetupProvinceInput[];
    departments?: SetupDepartmentInput[];
  };

  if (!president_name?.trim() || !president_email?.trim() || !president_password || president_password.length < 6) {
    return NextResponse.json(
      { error: 'Preencha o nome completo, e-mail e uma palavra-passe com pelo menos 6 caracteres para o Presidente.' },
      { status: 400 }
    );
  }

  let validatedStructure: ReturnType<typeof validateInitialStructure> | null = null;
  if (Array.isArray(provinces) || Array.isArray(departments)) {
    const dbProvinces = (
      db.prepare(`SELECT code, name, is_active FROM provinces ORDER BY name ASC`).all() as Array<{
        code: string;
        name: string;
        is_active: number;
      }>
    ).map((p) => ({ code: p.code, name: p.name, is_active: p.is_active === 1 }));

    const dbDepartments = db
      .prepare(`SELECT code, name, description FROM departments ORDER BY id ASC`)
      .all() as SetupDepartmentInput[];

    validatedStructure = validateInitialStructure(
      Array.isArray(provinces) ? provinces : dbProvinces,
      Array.isArray(departments) ? departments : dbDepartments
    );

    if (!validatedStructure.ok) {
      return NextResponse.json({ error: validatedStructure.error || 'Estrutura inicial inválida.' }, { status: 400 });
    }
  }

  const cleanEmail = president_email.trim().toLowerCase();
  const passwordHash = hashPassword(president_password);

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE system_settings
      SET organization_name = COALESCE(?, organization_name),
          acronym = COALESCE(?, acronym),
          slogan = COALESCE(?, slogan),
          nif = COALESCE(?, nif),
          headquarters_address = COALESCE(?, headquarters_address),
          contact_email = COALESCE(?, contact_email),
          contact_phone = COALESCE(?, contact_phone),
          logo_path = COALESCE(?, logo_path),
          setup_completed = 1,
          updated_at = datetime('now')
      WHERE id = 1
    `).run(
      organization_name?.trim() || null,
      acronym?.trim() || null,
      slogan?.trim() || null,
      nif?.trim() || '',
      headquarters_address?.trim() || null,
      contact_email?.trim() || null,
      contact_phone?.trim() || null,
      logo_path?.trim() || null
    );

    if (validatedStructure) {
      applyInitialStructure(db, validatedStructure.provinces, validatedStructure.departments);
    }

    const userRes = db
      .prepare(
        `
      INSERT INTO users (email, phone, password_hash, full_name, role_code, mfa_enabled, is_active, consent_lgpd)
      VALUES (?, ?, ?, ?, 'PRESIDENTE', ?, 1, 1)
    `
      )
      .run(cleanEmail, president_phone?.trim() || '', passwordHash, president_name.trim(), enable_mfa ? 1 : 0);

    const userId = Number(userRes.lastInsertRowid);

    const provCount = (db.prepare(`SELECT COUNT(*) as c FROM provinces WHERE is_active = 1`).get() as { c: number }).c;
    const deptCount = (db.prepare(`SELECT COUNT(*) as c FROM departments`).get() as { c: number }).c;

    writeAuditLog(db, {
      userId,
      userName: president_name.trim(),
      roleCode: 'PRESIDENTE',
      action: 'CONFIGURACAO_INICIAL_SISTEMA',
      entityType: 'system_settings',
      entityId: 1,
      details: {
        presidentEmail: cleanEmail,
        activeProvinces: provCount,
        departmentsCount: deptCount,
        inauguralContent: Boolean(seed_inaugural_content),
      },
    });

    createNotification(db, {
      userId,
      category: 'SISTEMA',
      title: 'SGAJJ Inicializado com Sucesso',
      message: `A estrutura base da AJJ foi inicializada com ${provCount} províncias ativas e ${deptCount} departamentos.`,
      linkUrl: '/painel',
    });

    if (seed_inaugural_content) {
      db.prepare(`
        INSERT OR IGNORE INTO publications (
          slug, title, subtitle, summary, content, category, author_id, author_name, status, published_at, seo_title, seo_description
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PUBLICADO', datetime('now'), ?, ?)
      `).run(
        'carta-fundacional-cultura-juridica-angola',
        'Cultura Jurídica, Cidadania e o Papel dos Jovens Juristas em Angola',
        'Editorial inaugural do portal A Voz Jurídica',
        'A Associação de Jovens Juristas reafirma o seu compromisso nacional com a promoção da justiça, educação jurídica comunitária e defesa dos direitos humanos.',
        'A consolidação do Estado Democrático de Direito exige juristas preparados, éticos e próximos das comunidades.\n\nAtravés da plataforma nacional SGAJJ, a Associação de Jovens Juristas (AJJ) integra todas as províncias de Angola num ambiente único de coordenação institucional, produção científica e serviço à cidadania.\n\nO portal A Voz Jurídica nasce como espaço aberto de análise constitucional, atualização legislativa, defesa dos direitos humanos e formação contínua para jovens juristas e estudantes de Direito em todo o território nacional.\n\nJuntos em prol do bem maior.',
        'Notícias institucionais',
        userId,
        president_name.trim(),
        'Cultura Jurídica e Cidadania em Angola | A Voz Jurídica — AJJ',
        'Editorial inaugural da Associação de Jovens Juristas sobre cultura jurídica, defesa dos direitos humanos e coordenação nacional em Angola.'
      );

      db.prepare(`
        INSERT INTO activities (
          title, activity_type, description, organizer_name, location, is_online, start_datetime, target_audience, max_participants, approval_status, created_by
        ) VALUES (?, 'CONFERENCIA', ?, ?, ?, 1, datetime('now', '+7 days'), ?, 300, 'APROVADA', ?)
      `).run(
        'Fórum Nacional sobre Acesso à Justiça e Cidadania',
        'Conferência nacional inaugural aberta a juristas, estudantes de Direito e cidadãos das províncias de Angola.',
        president_name.trim(),
        'Luanda & Transmissão Nacional Online',
        'Associados, Estudantes de Direito e Público Geral',
        userId
      );
    }

    return userId;
  });

  const userId = tx();
  const { rawToken, expiresAt } = createUserSession(
    userId,
    req.headers.get('user-agent') || '',
    req.headers.get('x-forwarded-for') || '127.0.0.1'
  );

  const response = NextResponse.json({ success: true, userId });
  response.cookies.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires: new Date(expiresAt),
  });
  return response;
}
