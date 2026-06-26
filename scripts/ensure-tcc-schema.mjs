import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/index.js';

const COLUMNS = [
  { name: 'eu_importer_company_name', ddl: 'VARCHAR(255) NULL' },
  { name: 'eu_importer_address', ddl: 'TEXT NULL' },
  { name: 'purchase_order_number', ddl: 'VARCHAR(255) NULL' },
  { name: 'invoice_number', ddl: 'VARCHAR(255) NULL' },
  { name: 'regulatory_framework', ddl: 'VARCHAR(255) NULL' },
  { name: 'reach_certificate_id', ddl: 'CHAR(36) NULL' },
  { name: 'certificate_issue_date', ddl: 'DATE NULL' },
  { name: 'certificate_valid_until_date', ddl: 'DATE NULL' },
];

function parseDatabaseUrl(databaseUrl) {
  const normalized = databaseUrl.replace(/^mysql:\/\//, 'http://');
  const url = new URL(normalized);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
  };
}

async function columnExists(prisma, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SHOW COLUMNS FROM \`tcc_applications\` LIKE '${column}'`
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const adapter = new PrismaMariaDb(parseDatabaseUrl(databaseUrl));
  const prisma = new PrismaClient({ adapter });

  try {
    for (const column of COLUMNS) {
      if (await columnExists(prisma, column.name)) {
        console.log(`OK  ${column.name}`);
        continue;
      }
      await prisma.$executeRawUnsafe(
        `ALTER TABLE \`tcc_applications\` ADD COLUMN \`${column.name}\` ${column.ddl}`
      );
      console.log(`ADD ${column.name}`);
    }
    console.log('TCC schema is up to date.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
