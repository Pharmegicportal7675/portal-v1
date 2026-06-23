const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

async function main() {
  // Try to get connection string from command-line argument first, then environment
  let connectionString = process.argv[2] || process.env.DIRECT_URL || process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('Error: Please provide a database connection string.');
    console.error('Usage: node scripts/migrate.js <connection_string>');
    console.error('Or set DIRECT_URL or DATABASE_URL in your environment/.env file.');
    process.exit(1);
  }

  // If the user pasted a connection string with the placeholder, remind them
  if (connectionString.includes('[YOUR-PASSWORD]')) {
    console.error('Error: Found "[YOUR-PASSWORD]" placeholder in connection string.');
    console.error('Please replace it with your actual Supabase database password.');
    process.exit(1);
  }

  console.log('Connecting to database...');
  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false // Required for Supabase external connections
    }
  });

  try {
    await client.connect();
    console.log('Connected successfully!');

    // Read the database.sql file
    // Check root and database/ folder for database.sql
    let sqlPath = path.join(__dirname, '../database.sql');
    if (!fs.existsSync(sqlPath)) {
      sqlPath = path.join(__dirname, '../database/database.sql');
    }

    if (!fs.existsSync(sqlPath)) {
      throw new Error('database.sql file not found in root or database/ directory.');
    }

    console.log(`Reading SQL schema from ${sqlPath}...`);
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executing SQL schema...');
    await client.query(sql);
    console.log('Database schema successfully initialized and tables created!');

  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
