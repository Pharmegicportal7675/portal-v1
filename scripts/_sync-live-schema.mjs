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

async function main() {
  let conn;
  try {
    conn = await pool.getConnection();
    console.log('Connected to', parsed.hostname, '/', parsed.pathname.replace(/^\//, ''));

    const before = {
      clients_cc_emails: await columnExists(conn, 'clients', 'cc_emails'),
      clients_cc_phones: await columnExists(conn, 'clients', 'cc_phones'),
      activity_ip: await columnExists(conn, 'activity_logs', 'ip_address'),
      activity_location: await columnExists(conn, 'activity_logs', 'location'),
    };
    console.log('Before:', before);

    if (before.clients_cc_emails) {
      await conn.query('ALTER TABLE clients DROP COLUMN cc_emails');
      console.log('Dropped clients.cc_emails');
    } else {
      console.log('clients.cc_emails already absent');
    }

    if (before.clients_cc_phones) {
      await conn.query('ALTER TABLE clients DROP COLUMN cc_phones');
      console.log('Dropped clients.cc_phones');
    } else {
      console.log('clients.cc_phones already absent');
    }

    if (!before.activity_ip) {
      await conn.query(
        'ALTER TABLE activity_logs ADD COLUMN ip_address VARCHAR(45) NULL AFTER metadata'
      );
      console.log('Added activity_logs.ip_address');
    } else {
      console.log('activity_logs.ip_address already present');
    }

    if (!(await columnExists(conn, 'activity_logs', 'location'))) {
      await conn.query(
        'ALTER TABLE activity_logs ADD COLUMN location VARCHAR(255) NULL AFTER ip_address'
      );
      console.log('Added activity_logs.location');
    } else {
      console.log('activity_logs.location already present');
    }

    const after = {
      clients_cc_emails: await columnExists(conn, 'clients', 'cc_emails'),
      clients_cc_phones: await columnExists(conn, 'clients', 'cc_phones'),
      activity_ip: await columnExists(conn, 'activity_logs', 'ip_address'),
      activity_location: await columnExists(conn, 'activity_logs', 'location'),
    };
    console.log('After:', after);
    console.log('Live schema sync OK');
  } finally {
    if (conn) conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
