const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Error: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be defined in your .env file.');
    process.exit(1);
  }

  const email = process.argv[2] || 'directoratulpatoliya@gmail.com';
  const password = process.argv[3] || 'Admin@1234';

  console.log(`Creating MASTER_ADMIN user with email: ${email}...`);

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        role: 'MASTER_ADMIN'
      }
    }
  });

  if (error) {
    console.error('Failed to create admin user:', error.message);
    process.exit(1);
  }

  console.log('\nMASTER_ADMIN user successfully registered in Supabase Auth!');
  console.log('--------------------------------------------------');
  console.log('Login Email:   ', email);
  console.log('Login Password:', password);
  console.log('--------------------------------------------------');
  console.log('\nNOTE: If Email Confirmation is enabled in your Supabase Auth settings,');
  console.log('you may need to confirm the email or temporarily disable confirmation');
  console.log('in the Supabase Dashboard (Authentication -> Providers -> Email -> Confirm email).');
}

main();
