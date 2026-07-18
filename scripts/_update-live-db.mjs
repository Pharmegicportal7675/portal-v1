import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mariadb from 'mariadb';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.join(root, '.env.local'));
loadEnvFile(path.join(root, '.env'));

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}

const parsed = new URL(url);
const pool = mariadb.createPool({
  host: parsed.hostname,
  port: Number(parsed.port || 3306),
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  database: parsed.pathname.replace(/^\//, ''),
  connectionLimit: 1,
  connectTimeout: 20000,
});

function renameBrand(value) {
  if (value == null || typeof value !== 'string') return value;
  return value.replace(/Pharmegic Healthcare(?! Limited)/g, 'Pharmegic Healthcare Limited');
}

async function columnExists(conn, table, column) {
  const rows = await conn.query(
    `SELECT COUNT(*) AS c
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(rows[0].c) > 0;
}

async function main() {
  let conn;
  try {
    conn = await pool.getConnection();
    console.log('Connected to', parsed.hostname, '/', parsed.pathname.replace(/^\//, ''));

    // 1) Schema sync
    const before = {
      clients_cc_emails: await columnExists(conn, 'clients', 'cc_emails'),
      clients_cc_phones: await columnExists(conn, 'clients', 'cc_phones'),
      activity_ip: await columnExists(conn, 'activity_logs', 'ip_address'),
      activity_location: await columnExists(conn, 'activity_logs', 'location'),
    };
    console.log('Schema before:', before);

    if (before.clients_cc_emails) {
      await conn.query('ALTER TABLE clients DROP COLUMN cc_emails');
      console.log('Dropped clients.cc_emails');
    }
    if (before.clients_cc_phones) {
      await conn.query('ALTER TABLE clients DROP COLUMN cc_phones');
      console.log('Dropped clients.cc_phones');
    }
    if (!before.activity_ip) {
      await conn.query(
        'ALTER TABLE activity_logs ADD COLUMN ip_address VARCHAR(45) NULL AFTER metadata'
      );
      console.log('Added activity_logs.ip_address');
    }
    if (!(await columnExists(conn, 'activity_logs', 'location'))) {
      await conn.query(
        'ALTER TABLE activity_logs ADD COLUMN location VARCHAR(255) NULL AFTER ip_address'
      );
      console.log('Added activity_logs.location');
    }

    const after = {
      clients_cc_emails: await columnExists(conn, 'clients', 'cc_emails'),
      clients_cc_phones: await columnExists(conn, 'clients', 'cc_phones'),
      activity_ip: await columnExists(conn, 'activity_logs', 'ip_address'),
      activity_location: await columnExists(conn, 'activity_logs', 'location'),
    };
    console.log('Schema after:', after);

    // 2) Brand text in templates + admin_settings string fields
    const templates = await conn.query(
      `SELECT id, footer_text, rc_footer_text, tcc_footer_text FROM templates`
    );
    for (const row of templates) {
      const next = {
        footer_text: renameBrand(row.footer_text),
        rc_footer_text: renameBrand(row.rc_footer_text),
        tcc_footer_text: renameBrand(row.tcc_footer_text),
      };
      const changed =
        next.footer_text !== row.footer_text ||
        next.rc_footer_text !== row.rc_footer_text ||
        next.tcc_footer_text !== row.tcc_footer_text;
      if (!changed) {
        console.log('templates brand already OK:', row.id);
        continue;
      }
      await conn.query(
        `UPDATE templates
         SET footer_text = ?, rc_footer_text = ?, tcc_footer_text = ?
         WHERE id = ?`,
        [next.footer_text, next.rc_footer_text, next.tcc_footer_text, row.id]
      );
      console.log('Updated templates brand:', row.id, next);
    }

    const settings = await conn.query(
      `SELECT id, full_name, smtp_from, rc_smtp_from, smtp_cc_default, rc_smtp_cc_default
       FROM admin_settings WHERE id = 1`
    );
    if (settings[0]) {
      const row = settings[0];
      const next = {
        full_name: renameBrand(row.full_name),
        smtp_from: renameBrand(row.smtp_from),
        rc_smtp_from: renameBrand(row.rc_smtp_from),
        smtp_cc_default: renameBrand(row.smtp_cc_default),
        rc_smtp_cc_default: renameBrand(row.rc_smtp_cc_default),
      };
      const changed =
        next.full_name !== row.full_name ||
        next.smtp_from !== row.smtp_from ||
        next.rc_smtp_from !== row.rc_smtp_from ||
        next.smtp_cc_default !== row.smtp_cc_default ||
        next.rc_smtp_cc_default !== row.rc_smtp_cc_default;
      console.log('admin_settings before:', {
        full_name: row.full_name,
        smtp_from: row.smtp_from,
        rc_smtp_from: row.rc_smtp_from,
      });
      if (changed) {
        await conn.query(
          `UPDATE admin_settings
           SET full_name = ?,
               smtp_from = ?,
               rc_smtp_from = ?,
               smtp_cc_default = ?,
               rc_smtp_cc_default = ?
           WHERE id = 1`,
          [
            next.full_name,
            next.smtp_from,
            next.rc_smtp_from,
            next.smtp_cc_default,
            next.rc_smtp_cc_default,
          ]
        );
        console.log('Updated admin_settings brand:', next);
      } else {
        console.log('admin_settings brand already OK');
      }
    }

    console.log('Live database update OK');
  } finally {
    if (conn) conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
