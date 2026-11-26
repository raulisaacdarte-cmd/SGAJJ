import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import {
  ANGOLA_PROVINCES,
  MEMBER_CATEGORIES_SEED,
  STATUTORY_DEPARTMENTS,
  STATUTORY_ROLES,
} from './domain';
import { generateToken, hashToken } from './crypto';

const DEFAULT_LOGO_PATH = '/assets/aistudio/IMG-20260804-WA0073_3cc94a37.jpg';

let dbInstance: Database.Database | null = null;

function getDbPath(): string {
  if (process.env.SGAJJ_DB_PATH) return process.env.SGAJJ_DB_PATH;
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, 'sgajj.db');
}

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  const dbPath = getDbPath();
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initializeSchema(db);
  seedStructuralCatalog(db);
  dbInstance = db;
  return db;
}

export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  initializeSchema(db);
  seedStructuralCatalog(db);
  return db;
}

function initializeSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      acronym TEXT NOT NULL DEFAULT 'SGAJJ',
      organization_name TEXT NOT NULL DEFAULT 'Associação de Jovens Juristas',
      slogan TEXT NOT NULL DEFAULT 'Juntos em prol do bem maior.',
      logo_path TEXT NOT NULL DEFAULT '${DEFAULT_LOGO_PATH}',
      nif TEXT DEFAULT '',
      headquarters_address TEXT DEFAULT 'Luanda, República de Angola',
      contact_email TEXT DEFAULT 'associacaodejovensjuristas@gmail.com',
      contact_phone TEXT DEFAULT '',
      institutional_iban TEXT DEFAULT '0040 0000 96614389101 60',
      privacy_policy TEXT NOT NULL DEFAULT '',
      setup_completed INTEGER NOT NULL DEFAULT 0,
      auto_backup_enabled INTEGER NOT NULL DEFAULT 1,
      last_backup_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sequences (
      key TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS provinces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS municipalities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      province_id INTEGER NOT NULL REFERENCES provinces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      UNIQUE(province_id, name)
    );

    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS roles (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      scope TEXT NOT NULL CHECK (scope IN ('NATIONAL', 'PROVINCIAL', 'MEMBER')),
      rank INTEGER NOT NULL,
      department_code TEXT REFERENCES departments(code)
    );

    CREATE TABLE IF NOT EXISTS member_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      monthly_quota_aoa REAL NOT NULL DEFAULT 0,
      description TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_code TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      birth_date TEXT,
      id_number_encrypted TEXT,
      phone TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      province_id INTEGER NOT NULL REFERENCES provinces(id),
      municipality_id INTEGER REFERENCES municipalities(id),
      institution TEXT DEFAULT '',
      academic_degree TEXT DEFAULT '',
      category_id INTEGER NOT NULL REFERENCES member_categories(id),
      photo_path TEXT,
      status TEXT NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'SUSPENSO', 'INATIVO', 'EXONERADO')),
      joined_at TEXT NOT NULL DEFAULT (date('now')),
      documents_json TEXT NOT NULL DEFAULT '[]',
      participation_history_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role_code TEXT NOT NULL REFERENCES roles(code),
      province_id INTEGER REFERENCES provinces(id),
      department_id INTEGER REFERENCES departments(id),
      member_id INTEGER REFERENCES members(id),
      photo_path TEXT,
      activation_pending INTEGER NOT NULL DEFAULT 0,
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      mfa_enabled INTEGER NOT NULL DEFAULT 0,
      mfa_pending_code_hash TEXT,
      mfa_pending_expires_at TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      consent_lgpd INTEGER NOT NULL DEFAULT 1,
      consent_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      user_agent TEXT DEFAULT '',
      ip_address TEXT DEFAULT '',
      trusted_device INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activation_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      purpose TEXT NOT NULL DEFAULT 'ACTIVATE' CHECK (purpose IN ('ACTIVATE', 'RESET')),
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS coordinations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      province_id INTEGER NOT NULL UNIQUE REFERENCES provinces(id),
      status TEXT NOT NULL DEFAULT 'INATIVA' CHECK (status IN ('INATIVA', 'ATIVA', 'SUSPENSA')),
      coordinator_user_id INTEGER REFERENCES users(id),
      coordinator_member_id INTEGER REFERENCES members(id),
      office_address TEXT DEFAULT '',
      contact_phone TEXT DEFAULT '',
      contact_email TEXT DEFAULT '',
      activated_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tracking_number TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      birth_date TEXT NOT NULL,
      id_number_encrypted TEXT,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      province_id INTEGER NOT NULL REFERENCES provinces(id),
      municipality_id INTEGER REFERENCES municipalities(id),
      institution TEXT NOT NULL DEFAULT '',
      academic_degree TEXT NOT NULL DEFAULT '',
      category_id INTEGER NOT NULL REFERENCES member_categories(id),
      photo_path TEXT,
      documents_json TEXT NOT NULL DEFAULT '[]',
      motivation TEXT DEFAULT '',
      consent_accepted INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'EM_ANALISE', 'AGUARDA_DOCUMENTACAO', 'AGUARDA_VALIDACAO', 'APROVADA', 'REJEITADA', 'SUSPENSA')),
      reviewer_notes TEXT DEFAULT '',
      reviewed_by INTEGER REFERENCES users(id),
      reviewed_at TEXT,
      member_id INTEGER REFERENCES members(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level INTEGER NOT NULL DEFAULT 1,
      province_id INTEGER NOT NULL REFERENCES provinces(id),
      candidate_name TEXT NOT NULL,
      candidate_email TEXT NOT NULL,
      candidate_phone TEXT NOT NULL,
      candidate_photo_path TEXT,
      attachment_path TEXT,
      member_id INTEGER REFERENCES members(id),
      user_id INTEGER REFERENCES users(id),
      role_code TEXT NOT NULL DEFAULT 'COORD_PROVINCIAL' REFERENCES roles(code),
      process_notes TEXT DEFAULT '',
      criteria_json TEXT NOT NULL DEFAULT '{}',
      requires_central_validation INTEGER NOT NULL DEFAULT 0,
      validated_by INTEGER REFERENCES users(id),
      validated_at TEXT,
      status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'AGUARDA_VALIDACAO', 'APROVADA', 'REJEITADA', 'EXONERADA')),
      dispatch_number TEXT UNIQUE,
      term_of_office_number TEXT UNIQUE,
      start_date TEXT,
      end_date TEXT,
      duration_months INTEGER NOT NULL DEFAULT 24,
      appointed_by INTEGER REFERENCES users(id),
      termination_reason TEXT,
      terminated_at TEXT,
      sms_status TEXT DEFAULT 'PENDENTE',
      credentials_channel TEXT DEFAULT 'EMAIL_E_SMS',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS digital_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL REFERENCES members(id),
      card_number TEXT NOT NULL UNIQUE,
      member_code TEXT NOT NULL,
      qr_token TEXT NOT NULL UNIQUE,
      issued_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      issuer_name TEXT NOT NULL DEFAULT 'Presidência Nacional da AJJ',
      status TEXT NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'INVALIDADO', 'EXPIRADO')),
      invalidated_reason TEXT,
      invalidated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS financial_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL CHECK (scope IN ('NACIONAL', 'PROVINCIAL')),
      province_id INTEGER REFERENCES provinces(id),
      name TEXT NOT NULL,
      balance_aoa REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quotas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL REFERENCES members(id),
      province_id INTEGER NOT NULL REFERENCES provinces(id),
      reference_month TEXT NOT NULL,
      amount_aoa REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'PAGO' CHECK (status IN ('PAGO', 'PENDENTE', 'EM_ATRASO')),
      paid_at TEXT,
      receipt_number TEXT UNIQUE,
      recorded_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(member_id, reference_month)
    );

    CREATE TABLE IF NOT EXISTS financial_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES financial_accounts(id),
      province_id INTEGER REFERENCES provinces(id),
      scope TEXT NOT NULL CHECK (scope IN ('NACIONAL', 'PROVINCIAL')),
      type TEXT NOT NULL CHECK (type IN ('RECEITA', 'DESPESA', 'QUOTA', 'CONTRIBUICAO_EXTRAORDINARIA')),
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount_aoa REAL NOT NULL,
      reference_date TEXT NOT NULL DEFAULT (date('now')),
      receipt_number TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'APROVADO' CHECK (status IN ('PENDENTE_APROVACAO', 'APROVADO', 'REJEITADO', 'ANULADO')),
      approved_by INTEGER REFERENCES users(id),
      approved_at TEXT,
      attachment_path TEXT,
      bank_code TEXT DEFAULT '',
      rupe_code TEXT DEFAULT '',
      payment_channel TEXT DEFAULT '',
      member_id INTEGER REFERENCES members(id),
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quota_rupes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rupe_code TEXT NOT NULL UNIQUE,
      rupe_formatted TEXT NOT NULL,
      member_id INTEGER REFERENCES members(id),
      province_id INTEGER REFERENCES provinces(id),
      reference_month TEXT NOT NULL,
      amount_aoa REAL NOT NULL,
      bank_code TEXT NOT NULL CHECK (bank_code IN ('BAI', 'BIC', 'BFA', 'BCI', 'MULTICAIXA')),
      bank_name TEXT NOT NULL,
      beneficiary_iban TEXT NOT NULL DEFAULT '0040 0000 96614389101 60',
      beneficiary_iban_ao06 TEXT NOT NULL DEFAULT 'AO06 0040 0000 96614389101 60',
      beneficiary_name TEXT NOT NULL DEFAULT 'Associação de Jovens Juristas (AJJ)',
      status TEXT NOT NULL DEFAULT 'AGUARDA_PAGAMENTO' CHECK (status IN ('AGUARDA_PAGAMENTO', 'COMPROVATIVO_SUBMETIDO', 'PAGO', 'EXPIRADO', 'CANCELADO')),
      expires_at TEXT NOT NULL,
      proof_reference TEXT DEFAULT '',
      proof_path TEXT,
      submitted_at TEXT,
      paid_at TEXT,
      receipt_number TEXT,
      transaction_id INTEGER REFERENCES financial_transactions(id),
      created_by INTEGER REFERENCES users(id),
      confirmed_by INTEGER REFERENCES users(id),
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      province_id INTEGER REFERENCES provinces(id),
      department_id INTEGER REFERENCES departments(id),
      version INTEGER NOT NULL DEFAULT 1,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      file_size INTEGER NOT NULL DEFAULT 0,
      access_level TEXT NOT NULL DEFAULT 'COORDENACAO' CHECK (access_level IN ('PUBLICO', 'ASSOCIADOS', 'COORDENACAO', 'DIRECAO_CENTRAL', 'CONFIDENCIAL')),
      doc_date TEXT NOT NULL DEFAULT (date('now')),
      description TEXT DEFAULT '',
      uploaded_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS document_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      notes TEXT DEFAULT '',
      uploaded_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      activity_type TEXT NOT NULL,
      description TEXT NOT NULL,
      organizer_name TEXT NOT NULL,
      location TEXT NOT NULL,
      is_online INTEGER NOT NULL DEFAULT 0,
      start_datetime TEXT NOT NULL,
      end_datetime TEXT,
      target_audience TEXT DEFAULT 'Juristas, Estudantes de Direito e Cidadãos',
      max_participants INTEGER DEFAULT 200,
      province_id INTEGER REFERENCES provinces(id),
      approval_status TEXT NOT NULL DEFAULT 'APROVADA' CHECK (approval_status IN ('APROVADA', 'PENDENTE_DIRECAO', 'REJEITADA')),
      final_report TEXT DEFAULT '',
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activity_registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
      member_id INTEGER REFERENCES members(id),
      participant_name TEXT NOT NULL,
      participant_email TEXT NOT NULL,
      participant_phone TEXT DEFAULT '',
      attended INTEGER NOT NULL DEFAULT 0,
      certificate_code TEXT UNIQUE,
      certificate_issued_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS publications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      subtitle TEXT DEFAULT '',
      summary TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      cover_image TEXT,
      video_url TEXT,
      stream_embed_url TEXT,
      author_id INTEGER REFERENCES users(id),
      author_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PUBLICADO' CHECK (status IN ('RASCUNHO', 'PENDENTE_APROVACAO', 'AGENDADO', 'PUBLICADO', 'ARQUIVADO')),
      scheduled_at TEXT,
      published_at TEXT,
      views_count INTEGER NOT NULL DEFAULT 0,
      seo_title TEXT,
      seo_description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS publication_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      publication_id INTEGER NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
      author_name TEXT NOT NULL,
      author_email TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'APROVADO', 'REJEITADO')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS legal_office_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_type TEXT NOT NULL CHECK (item_type IN ('PARECER', 'CONSULTA', 'LEGISLACAO', 'ESTUDO', 'PROCESSO_INTERNO', 'EDUCACAO_JURIDICA', 'RELATORIO_INTERVENCAO')),
      reference_code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      content TEXT NOT NULL,
      confidentiality TEXT NOT NULL DEFAULT 'DIRECAO_CENTRAL' CHECK (confidentiality IN ('RESTRITO', 'DIRECAO_CENTRAL', 'PROVINCIAL', 'PUBLICO')),
      submitted_to_central INTEGER NOT NULL DEFAULT 0,
      province_id INTEGER REFERENCES provinces(id),
      status TEXT NOT NULL DEFAULT 'EM_ANALISE',
      file_path TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ethics_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_number TEXT NOT NULL UNIQUE,
      case_type TEXT NOT NULL CHECK (case_type IN ('OCORRENCIA', 'PARTICIPACAO', 'DENUNCIA', 'PROCESSO_DISCIPLINAR')),
      subject TEXT NOT NULL,
      description TEXT NOT NULL,
      province_id INTEGER REFERENCES provinces(id),
      accused_info TEXT DEFAULT '',
      complainant_info TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'RECEBIDO' CHECK (status IN ('RECEBIDO', 'EM_DILIGENCIA', 'CONTRADITORIO', 'RELATORIO_EMITIDO', 'ENCAMINHADO', 'ENCERRADO')),
      proceedings_log_json TEXT NOT NULL DEFAULT '[]',
      recommendations TEXT DEFAULT '',
      forwarded_to TEXT DEFAULT '',
      decision_summary TEXT DEFAULT '',
      assigned_to INTEGER REFERENCES users(id),
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL REFERENCES users(id),
      target_scope TEXT NOT NULL CHECK (target_scope IN ('TODOS_ASSOCIADOS', 'DIRECAO_CENTRAL', 'COORDENADORES_PROVINCIAIS', 'COORDENACAO_ESPECIFICA', 'DEPARTAMENTO_ESPECIFICO', 'INDIVIDUAL')),
      target_province_id INTEGER REFERENCES provinces(id),
      target_department_id INTEGER REFERENCES departments(id),
      target_user_id INTEGER REFERENCES users(id),
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      channels_json TEXT NOT NULL DEFAULT '["IN_APP"]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link_url TEXT DEFAULT '/painel',
      channel TEXT NOT NULL DEFAULT 'IN_APP',
      delivery_status TEXT NOT NULL DEFAULT 'ENTREGUE',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_name TEXT NOT NULL DEFAULT 'Sistema',
      role_code TEXT NOT NULL DEFAULT 'SISTEMA',
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details_json TEXT NOT NULL DEFAULT '{}',
      previous_state_json TEXT NOT NULL DEFAULT '{}',
      new_state_json TEXT NOT NULL DEFAULT '{}',
      supporting_doc_path TEXT,
      ip_address TEXT DEFAULT '127.0.0.1',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sms_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_name TEXT NOT NULL DEFAULT '',
      recipient_phone TEXT NOT NULL,
      phone_e164 TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'CANDIDATURA',
      related_entity TEXT,
      related_id TEXT,
      provider TEXT NOT NULL DEFAULT 'SGAJJ_OUTBOX_LOCAL',
      provider_message_id TEXT,
      status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'ENVIADO_GATEWAY', 'ENFILEIRADO_LOCAL', 'FALHA_ENVIO')),
      error_message TEXT,
      attempts INTEGER NOT NULL DEFAULT 1,
      sent_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS email_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_name TEXT NOT NULL DEFAULT '',
      recipient_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      text_body TEXT NOT NULL,
      html_body TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'ATIVACAO',
      related_entity TEXT,
      related_id TEXT,
      provider TEXT NOT NULL DEFAULT 'SGAJJ_EMAIL_OUTBOX_LOCAL',
      provider_message_id TEXT,
      status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'ENVIADO_GATEWAY', 'ENFILEIRADO_LOCAL', 'FALHA_ENVIO')),
      error_message TEXT,
      attempts INTEGER NOT NULL DEFAULT 1,
      sent_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_members_province ON members(province_id);
    CREATE INDEX IF NOT EXISTS idx_members_code ON members(member_code);
    CREATE INDEX IF NOT EXISTS idx_applications_tracking ON applications(tracking_number);
    CREATE INDEX IF NOT EXISTS idx_transactions_scope ON financial_transactions(scope, province_id);
    CREATE INDEX IF NOT EXISTS idx_publications_slug ON publications(slug);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activation_tokens_user ON activation_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_sms_logs_created ON sms_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sms_logs_related ON sms_logs(related_entity, related_id);
    CREATE INDEX IF NOT EXISTS idx_email_logs_created ON email_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_email_logs_related ON email_logs(related_entity, related_id);
    CREATE INDEX IF NOT EXISTS idx_quota_rupes_member ON quota_rupes(member_id, reference_month);
    CREATE INDEX IF NOT EXISTS idx_quota_rupes_status ON quota_rupes(status, created_at DESC);
  `);

  const safeAlter = (table: string, col: string, def: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === col)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
    }
  };

  safeAlter('system_settings', 'institutional_iban', "TEXT DEFAULT '0040 0000 96614389101 60'");
  safeAlter('financial_transactions', 'bank_code', "TEXT DEFAULT ''");
  safeAlter('financial_transactions', 'rupe_code', "TEXT DEFAULT ''");
  safeAlter('financial_transactions', 'payment_channel', "TEXT DEFAULT ''");
  safeAlter('users', 'photo_path', 'TEXT');
  safeAlter('users', 'activation_pending', 'INTEGER NOT NULL DEFAULT 0');
  safeAlter('users', 'failed_login_attempts', 'INTEGER NOT NULL DEFAULT 0');
  safeAlter('users', 'locked_until', 'TEXT');
  safeAlter('sessions', 'trusted_device', 'INTEGER NOT NULL DEFAULT 0');
  safeAlter('appointments', 'level', 'INTEGER NOT NULL DEFAULT 1');
  safeAlter('appointments', 'candidate_photo_path', 'TEXT');
  safeAlter('appointments', 'attachment_path', 'TEXT');
  safeAlter('appointments', 'requires_central_validation', 'INTEGER NOT NULL DEFAULT 0');
  safeAlter('appointments', 'validated_by', 'INTEGER REFERENCES users(id)');
  safeAlter('appointments', 'validated_at', 'TEXT');
  safeAlter('audit_logs', 'previous_state_json', "TEXT NOT NULL DEFAULT '{}'");
  safeAlter('audit_logs', 'new_state_json', "TEXT NOT NULL DEFAULT '{}'");
  safeAlter('audit_logs', 'supporting_doc_path', 'TEXT');
}

function seedStructuralCatalog(db: Database.Database) {
  const settingsCount = (db.prepare('SELECT COUNT(*) as c FROM system_settings').get() as { c: number }).c;
  if (settingsCount === 0) {
    db.prepare(`
      INSERT INTO system_settings (id, acronym, organization_name, slogan, logo_path, privacy_policy)
      VALUES (1, 'SGAJJ', 'Associação de Jovens Juristas', 'Juntos em prol do bem maior.', ?, ?)
    `).run(
      DEFAULT_LOGO_PATH,
      'A Associação de Jovens Juristas (AJJ) trata os dados pessoais dos seus associados, candidatos e cidadãos em estrita conformidade com a Lei n.º 22/11, de 17 de Junho (Lei da Proteção de Dados Pessoais de Angola), garantindo finalidade institucional, confidencialidade, segurança técnica e direito de acesso, retificação e oposição.'
    );
  }

  const insertDept = db.prepare(`INSERT OR IGNORE INTO departments (code, name) VALUES (?, ?)`);
  for (const dept of STATUTORY_DEPARTMENTS) {
    insertDept.run(dept.code, dept.name);
  }

  const upsertRole = db.prepare(`
    INSERT INTO roles (code, name, scope, rank, department_code) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET name = excluded.name, scope = excluded.scope, rank = excluded.rank, department_code = excluded.department_code
  `);
  for (const role of STATUTORY_ROLES) {
    upsertRole.run(role.code, role.name, role.scope, role.rank, role.departmentCode);
  }

  const insertProv = db.prepare(`INSERT OR IGNORE INTO provinces (code, name) VALUES (?, ?)`);
  const getProv = db.prepare(`SELECT id FROM provinces WHERE code = ?`);
  const insertMun = db.prepare(`INSERT OR IGNORE INTO municipalities (province_id, name) VALUES (?, ?)`);
  const insertCoord = db.prepare(`INSERT OR IGNORE INTO coordinations (province_id, status) VALUES (?, 'INATIVA')`);
  const checkProvAcc = db.prepare(`SELECT id FROM financial_accounts WHERE scope = 'PROVINCIAL' AND province_id = ?`);
  const insertProvAcc = db.prepare(`INSERT INTO financial_accounts (scope, province_id, name, balance_aoa) VALUES ('PROVINCIAL', ?, ?, 0)`);

  for (const prov of ANGOLA_PROVINCES) {
    insertProv.run(prov.code, prov.name);
    const row = getProv.get(prov.code) as { id: number };
    for (const mun of prov.municipalities) {
      insertMun.run(row.id, mun);
    }
    insertCoord.run(row.id);
    const acc = checkProvAcc.get(row.id);
    if (!acc) {
      insertProvAcc.run(row.id, `Fundo Provincial — ${prov.name}`);
    }
  }

  const natAcc = db.prepare(`SELECT id FROM financial_accounts WHERE scope = 'NACIONAL'`).get();
  if (!natAcc) {
    db.prepare(`INSERT INTO financial_accounts (scope, province_id, name, balance_aoa) VALUES ('NACIONAL', NULL, 'Tesouraria Nacional da AJJ', 0)`).run();
  }

  const insertCat = db.prepare(`INSERT OR IGNORE INTO member_categories (code, name, monthly_quota_aoa, description) VALUES (?, ?, ?, ?)`);
  for (const cat of MEMBER_CATEGORIES_SEED) {
    insertCat.run(cat.code, cat.name, cat.monthly_quota_aoa, cat.description);
  }

  seedAuthenticInstitutionalBaseline(db);
}

function seedAuthenticInstitutionalBaseline(db: Database.Database) {
  const legalCount = (db.prepare(`SELECT COUNT(*) as c FROM legal_office_items`).get() as { c: number }).c;
  if (legalCount === 0) {
    const insLegal = db.prepare(`
      INSERT OR IGNORE INTO legal_office_items (
        item_type, reference_code, title, summary, content, confidentiality, submitted_to_central, status
      ) VALUES (?, ?, ?, ?, ?, 'PUBLICO', 1, 'APROVADO')
    `);

    insLegal.run(
      'LEGISLACAO',
      'CRA-2010-ART29',
      'Constituição da República de Angola — Acesso ao Direito e Tutela Jurisdicional',
      'Referência normativa constitucional sobre direitos, liberdades e garantias fundamentais dos cidadãos angolanos.',
      'Artigo 29.º (Acesso ao direito e tutela jurisdicional efetiva): Todos têm direito à informação e consulta jurídicas, ao patrocínio judiciário e a fazer-se acompanhar por advogado perante qualquer autoridade.',
    );

    insLegal.run(
      'LEGISLACAO',
      'LEI-22-11-LPDP',
      'Lei n.º 22/11, de 17 de Junho — Lei da Proteção de Dados Pessoais',
      'Enquadramento legal aplicável ao tratamento de dados pessoais de candidatos e associados no SGAJJ.',
      'A Lei n.º 22/11 estabelece o regime jurídico do tratamento de dados pessoais na República de Angola, impondo consentimento expresso, licitude, finalidade institucional e medidas de segurança técnicas.',
    );
  }
}

export function getNextSequence(db: Database.Database, key: string): number {
  const tx = db.transaction(() => {
    db.prepare(`INSERT OR IGNORE INTO sequences (key, value) VALUES (?, 0)`).run(key);
    db.prepare(`UPDATE sequences SET value = value + 1 WHERE key = ?`).run(key);
    const row = db.prepare(`SELECT value FROM sequences WHERE key = ?`).get(key) as { value: number };
    return row.value;
  });
  return tx();
}

export function writeAuditLog(
  db: Database.Database,
  params: {
    userId?: number | null;
    userName?: string;
    roleCode?: string;
    action: string;
    entityType: string;
    entityId?: string | number | null;
    details?: Record<string, unknown>;
    previousState?: Record<string, unknown>;
    newState?: Record<string, unknown>;
    supportingDocPath?: string | null;
    ipAddress?: string;
  }
) {
  db.prepare(`
    INSERT INTO audit_logs (
      user_id, user_name, role_code, action, entity_type, entity_id,
      details_json, previous_state_json, new_state_json, supporting_doc_path, ip_address
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.userId ?? null,
    params.userName || 'Sistema',
    params.roleCode || 'SISTEMA',
    params.action,
    params.entityType,
    params.entityId !== undefined && params.entityId !== null ? String(params.entityId) : null,
    JSON.stringify(params.details || {}),
    JSON.stringify(params.previousState || {}),
    JSON.stringify(params.newState || {}),
    params.supportingDocPath || null,
    params.ipAddress || '127.0.0.1'
  );
}

export function createActivationToken(
  db: Database.Database,
  userId: number,
  purpose: 'ACTIVATE' | 'RESET' = 'ACTIVATE',
  hoursValid = 48
): { rawToken: string; expiresAt: string } {
  const rawToken = generateToken(24);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + hoursValid * 60 * 60 * 1000).toISOString();

  db.prepare(`UPDATE activation_tokens SET used_at = datetime('now') WHERE user_id = ? AND purpose = ? AND used_at IS NULL`).run(
    userId,
    purpose
  );
  db.prepare(`
    INSERT INTO activation_tokens (user_id, token_hash, purpose, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(userId, tokenHash, purpose, expiresAt);

  return { rawToken, expiresAt };
}

export function createNotification(
  db: Database.Database,
  params: {
    userId?: number | null;
    category: string;
    title: string;
    message: string;
    linkUrl?: string;
    channel?: 'IN_APP' | 'EMAIL' | 'SMS' | 'PUSH';
  }
) {
  const channel = params.channel || 'IN_APP';
  const info = db.prepare(`
    INSERT INTO notifications (user_id, category, title, message, link_url, channel, delivery_status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.userId ?? null,
    params.category,
    params.title,
    params.message,
    params.linkUrl || '/painel',
    channel,
    channel === 'IN_APP' ? 'ENTREGUE' : 'REGISTADO_CANAL'
  );
  return info.lastInsertRowid;
}

export function applyInitialStructure(
  db: Database.Database,
  provinces: Array<{ code: string; name: string; is_active: boolean; municipalities: string[] }>,
  departments: Array<{ code: string; name: string; description: string }>
) {
  const existingProvs = db.prepare(`SELECT id, code FROM provinces`).all() as Array<{ id: number; code: string }>;
  const existingByCode = new Map(existingProvs.map((p) => [p.code.toUpperCase(), p.id]));
  const keptCodes = new Set(provinces.map((p) => p.code.toUpperCase()));

  for (const prov of provinces) {
    const code = prov.code.toUpperCase();
    const activeInt = prov.is_active ? 1 : 0;
    const existingId = existingByCode.get(code);
    let provId: number;

    if (existingId) {
      db.prepare(`UPDATE provinces SET name = ?, is_active = ? WHERE id = ?`).run(prov.name, activeInt, existingId);
      provId = existingId;
    } else {
      const res = db.prepare(`INSERT INTO provinces (code, name, is_active) VALUES (?, ?, ?)`).run(code, prov.name, activeInt);
      provId = Number(res.lastInsertRowid);
    }

    db.prepare(`INSERT OR IGNORE INTO coordinations (province_id, status) VALUES (?, 'INATIVA')`).run(provId);

    const acc = db.prepare(`SELECT id FROM financial_accounts WHERE scope = 'PROVINCIAL' AND province_id = ?`).get(provId);
    if (!acc) {
      db.prepare(`INSERT INTO financial_accounts (scope, province_id, name, balance_aoa) VALUES ('PROVINCIAL', ?, ?, 0)`).run(
        provId,
        `Fundo Provincial — ${prov.name}`
      );
    }

    if (prov.municipalities.length > 0) {
      const insMun = db.prepare(`INSERT OR IGNORE INTO municipalities (province_id, name) VALUES (?, ?)`);
      for (const mun of prov.municipalities) {
        insMun.run(provId, mun);
      }
    }
  }

  for (const row of existingProvs) {
    if (!keptCodes.has(row.code.toUpperCase())) {
      const refs = (
        db.prepare(`
          SELECT
            (SELECT COUNT(*) FROM members WHERE province_id = ?) +
            (SELECT COUNT(*) FROM applications WHERE province_id = ?) +
            (SELECT COUNT(*) FROM appointments WHERE province_id = ?) +
            (SELECT COUNT(*) FROM users WHERE province_id = ?) as total
        `).get(row.id, row.id, row.id, row.id) as { total: number }
      ).total;
      if (refs === 0) {
        db.prepare(`DELETE FROM financial_accounts WHERE scope = 'PROVINCIAL' AND province_id = ?`).run(row.id);
        db.prepare(`DELETE FROM coordinations WHERE province_id = ?`).run(row.id);
        db.prepare(`DELETE FROM municipalities WHERE province_id = ?`).run(row.id);
        db.prepare(`DELETE FROM provinces WHERE id = ?`).run(row.id);
      } else {
        db.prepare(`UPDATE provinces SET is_active = 0 WHERE id = ?`).run(row.id);
      }
    }
  }

  const keptDeptCodes = new Set(departments.map((d) => d.code.toUpperCase()));
  const upsertDept = db.prepare(`
    INSERT INTO departments (code, name, description) VALUES (?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET name = excluded.name, description = excluded.description
  `);
  for (const dept of departments) {
    upsertDept.run(dept.code.toUpperCase(), dept.name, dept.description);
  }

  const allDepts = db.prepare(`SELECT id, code FROM departments`).all() as Array<{ id: number; code: string }>;
  for (const d of allDepts) {
    if (!keptDeptCodes.has(d.code.toUpperCase())) {
      const roleRefs = (db.prepare(`SELECT COUNT(*) as c FROM roles WHERE department_code = ?`).get(d.code) as { c: number }).c;
      const userRefs = (db.prepare(`SELECT COUNT(*) as c FROM users WHERE department_id = ?`).get(d.id) as { c: number }).c;
      const docRefs = (db.prepare(`SELECT COUNT(*) as c FROM documents WHERE department_id = ?`).get(d.id) as { c: number }).c;
      if (roleRefs === 0 && userRefs === 0 && docRefs === 0) {
        db.prepare(`DELETE FROM departments WHERE id = ?`).run(d.id);
      }
    }
  }
}

