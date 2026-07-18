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

async function ensureColumn(conn, table, column, ddl) {
  if (await columnExists(conn, table, column)) {
    console.log(`OK  ${table}.${column}`);
    return false;
  }
  await conn.query(ddl);
  console.log(`ADD ${table}.${column}`);
  return true;
}

async function dropColumnIfExists(conn, table, column) {
  if (!(await columnExists(conn, table, column))) {
    console.log(`OK  ${table}.${column} absent`);
    return false;
  }
  await conn.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``);
  console.log(`DROP ${table}.${column}`);
  return true;
}

async function main() {
  let conn;
  try {
    conn = await pool.getConnection();
    console.log('Connected:', parsed.hostname, parsed.pathname.replace(/^\//, ''));

    // Match prisma/database.mysql.sql + migrations
    await dropColumnIfExists(conn, 'clients', 'cc_emails');
    await dropColumnIfExists(conn, 'clients', 'cc_phones');

    await ensureColumn(
      conn,
      'activity_logs',
      'ip_address',
      'ALTER TABLE activity_logs ADD COLUMN ip_address VARCHAR(45) NULL AFTER metadata'
    );
    await ensureColumn(
      conn,
      'activity_logs',
      'location',
      'ALTER TABLE activity_logs ADD COLUMN location VARCHAR(255) NULL AFTER ip_address'
    );

    await ensureColumn(
      conn,
      'chemicals',
      'is_intermediate_substance',
      'ALTER TABLE chemicals ADD COLUMN is_intermediate_substance TINYINT(1) NOT NULL DEFAULT 0'
    );

    await ensureColumn(
      conn,
      'tcc_applications',
      'certificate_valid_until_date',
      'ALTER TABLE tcc_applications ADD COLUMN certificate_valid_until_date DATE NULL'
    );

    // Brand footer in seed/templates (from SQL INSERT defaults)
    const brand = 'Pharmegic Healthcare Limited Compliance Division. For verification, scan the QR code.';
    const [tpl] = await conn.query(
      `SELECT id, footer_text FROM templates LIMIT 1`
    );
    if (tpl) {
      if (tpl.footer_text !== brand && String(tpl.footer_text || '').includes('Pharmegic Healthcare')) {
        const next = String(tpl.footer_text).replace(
          /Pharmegic Healthcare(?! Limited)/g,
          'Pharmegic Healthcare Limited'
        );
        if (next !== tpl.footer_text) {
          await conn.query(`UPDATE templates SET footer_text = ? WHERE id = ?`, [next, tpl.id]);
          console.log('UPD templates.footer_text brand');
        } else {
          console.log('OK  templates.footer_text');
        }
      } else {
        console.log('OK  templates.footer_text');
      }
    }

    console.log('SQL → Live sync complete');
  } finally {
    if (conn) conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
