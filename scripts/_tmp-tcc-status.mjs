import mariadb from 'mariadb';

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

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}

const conn = await mariadb.createConnection(parseDatabaseUrl(databaseUrl));
try {
  const certs = await conn.query(
    `SELECT certificate_number, status, tcc_application_id, type
     FROM certificates
     WHERE certificate_number = ?`,
    ['TCC-2026-LJVMR9']
  );
  for (const row of certs) {
    console.log(['CERT', row.certificate_number, row.status, row.type, row.tcc_application_id || '-'].join(' | '));
  }
  const logs = await conn.query(
    `SELECT action, created_at, LEFT(description, 180) AS description
     FROM activity_logs
     WHERE created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 MINUTE)
       AND (action LIKE '%TCC%' OR action LIKE '%DELETE%' OR description LIKE '%LJVMR9%' OR description LIKE '%2.00%' OR description LIKE '%2 MT%')
     ORDER BY created_at DESC
     LIMIT 20`
  );
  for (const row of logs) {
    const when = row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at);
    console.log(['LOG', when, row.action, row.description].join(' | '));
  }
  const rows = await conn.query(
    `SELECT a.id, a.status, a.quantity_mt, a.updated_at, a.created_at, a.regulatory_framework,
            c.company_name, cert.certificate_number, cert.status AS cert_status
     FROM tcc_applications a
     JOIN clients c ON c.id = a.client_id
     LEFT JOIN certificates cert ON cert.tcc_application_id = a.id AND cert.type = 'TCC'
     WHERE c.company_name LIKE ?
     ORDER BY a.created_at DESC
     LIMIT 12`,
    ['%Letvar%']
  );
  for (const row of rows) {
    console.log(
      [
        row.company_name,
        String(row.quantity_mt),
        row.status,
        row.certificate_number || '-',
        row.cert_status || '-',
        row.regulatory_framework || '-',
        row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
        row.id,
      ].join(' | ')
    );
  }
} finally {
  await conn.end();
}
