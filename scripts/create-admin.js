const bcrypt = require('bcryptjs');
require('dotenv').config();

const SALT_ROUNDS = 12;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Error: DATABASE_URL must be defined in your .env file.');
    process.exit(1);
  }

  const email = process.argv[2] || 'directoratulpatoliya@gmail.com';
  const password = process.argv[3] || 'Admin@1234';
  const role = process.argv[4] || 'MASTER_ADMIN';

  console.log(`Creating ${role} user with email: ${email}...`);

  const { createDbClient } = await import('../lib/db/query-client.ts');
  const db = createDbClient();
  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

  const { data: existing } = await db.from('users').select('id').eq('email', email).maybeSingle();

  if (existing) {
    const { error } = await db.from('users').update({ password_hash, role }).eq('email', email);
    if (error) {
      console.error('Failed to update admin user:', error.message);
      process.exit(1);
    }
    console.log(`\n${role} password updated in MySQL.`);
  } else {
    const { error } = await db.from('users').insert({
      email,
      password_hash,
      role,
      is_disabled: false,
    });
    if (error) {
      console.error('Failed to create admin user:', error.message);
      process.exit(1);
    }
    console.log(`\n${role} user successfully created in MySQL!`);
  }

  console.log('--------------------------------------------------');
  console.log('Login Email:   ', email);
  console.log('Login Password:', password);
  console.log('--------------------------------------------------');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
