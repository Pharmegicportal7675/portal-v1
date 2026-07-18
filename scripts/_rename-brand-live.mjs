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

async function main() {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(
      `SELECT id, footer_text, rc_footer_text, tcc_footer_text FROM templates`
    );

    console.log('Templates found:', rows.length);
    for (const row of rows) {
      const next = {
        footer_text: renameBrand(row.footer_text),
        rc_footer_text: renameBrand(row.rc_footer_text),
        tcc_footer_text: renameBrand(row.tcc_footer_text),
      };

      const changed =
        next.footer_text !== row.footer_text ||
        next.rc_footer_text !== row.rc_footer_text ||
        next.tcc_footer_text !== row.tcc_footer_text;

      console.log('Before:', {
        id: row.id,
        footer_text: row.footer_text,
        rc_footer_text: row.rc_footer_text,
        tcc_footer_text: row.tcc_footer_text,
      });

      if (!changed) {
        console.log('No change needed for', row.id);
        continue;
      }

      await conn.query(
        `UPDATE templates
         SET footer_text = ?,
             rc_footer_text = ?,
             tcc_footer_text = ?
         WHERE id = ?`,
        [next.footer_text, next.rc_footer_text, next.tcc_footer_text, row.id]
      );
      console.log('Updated', row.id, next);
    }

    console.log('Brand rename on live templates OK');
  } finally {
    if (conn) conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
