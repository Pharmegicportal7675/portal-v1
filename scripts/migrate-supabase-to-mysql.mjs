#!/usr/bin/env node
/**
 * One-time migration: Supabase PostgreSQL -> Hostinger MySQL
 *
 * Requires:
 *   SUPABASE_DATABASE_URL=postgresql://...
 *   DATABASE_URL=mysql://...
 *
 * Usage: npm run db:migrate-from-supabase
 */
import 'dotenv/config';
import pg from 'pg';
import { PrismaClient } from '../generated/prisma/index.js';

const TABLES = [
  'admin_settings',
  'templates',
  'chemicals',
  'clients',
  'users',
  'client_contacts',
  'client_chemicals',
  'tcc_applications',
  'certificates',
  'quota_transactions',
  'notifications',
  'activity_logs',
  'audit_logs',
  'internal_notes',
];

function pgArrayToJson(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
    const inner = value.slice(1, -1);
    if (!inner) return JSON.stringify([]);
    return JSON.stringify(inner.split(',').map((s) => s.replace(/^"|"$/g, '')));
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

function normalizeRow(table, row) {
  const out = { ...row };
  if (table === 'clients' && out.regulatory_registrations !== undefined) {
    out.regulatory_registrations = pgArrayToJson(out.regulatory_registrations);
  }
  if ((table === 'activity_logs' || table === 'audit_logs') && out.metadata !== undefined) {
    out.metadata = out.metadata ? JSON.stringify(out.metadata) : null;
  }
  if (table === 'certificates' && out.mail_sent_history !== undefined) {
    out.mail_sent_history = out.mail_sent_history
      ? JSON.stringify(out.mail_sent_history)
      : JSON.stringify([]);
  }
  return out;
}

async function main() {
  const pgUrl = process.env.SUPABASE_DATABASE_URL;
  if (!pgUrl) {
    console.error('Missing SUPABASE_DATABASE_URL');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: pgUrl, ssl: { rejectUnauthorized: false } });
  const prisma = new PrismaClient();

  console.log('Migrating Pharmegic data Supabase -> MySQL...\n');

  for (const table of TABLES) {
    const { rows } = await pool.query(`SELECT * FROM public.${table} ORDER BY 1`);
    const delegate = prisma[table];
    if (!delegate) {
      console.warn(`Skip unknown table ${table}`);
      continue;
    }

    let inserted = 0;
    for (const row of rows) {
      const data = normalizeRow(table, row);
      try {
        await delegate.create({ data });
        inserted++;
      } catch (err) {
        if (String(err).includes('Unique constraint')) {
          await delegate.update({ where: { id: data.id }, data });
          inserted++;
        } else {
          console.error(`Failed ${table} id=${data.id}:`, err.message || err);
        }
      }
    }
    console.log(`${table}: ${inserted}/${rows.length} rows`);
  }

  await pool.end();
  await prisma.$disconnect();
  console.log('\nMigration complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
