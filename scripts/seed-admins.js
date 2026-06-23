import { createAdminClient } from '../lib/supabase/admin';
import { hashPassword } from '../lib/auth/password';

async function seed() {
  const adminSupabase = createAdminClient();

  // Seed Super Admin
  const superEmail = 'atul.patoliya@gmail.com';
  const superPass = 'Admin@1234';
  const superHash = await hashPassword(superPass);

  const { data: existingSuper } = await adminSupabase
    .from('users')
    .select('id')
    .eq('email', superEmail)
    .maybeSingle();

  if (!existingSuper) {
    const { error: superError } = await adminSupabase.from('users').insert({
      email: superEmail,
      password_hash: superHash,
      role: 'SUPER_ADMIN',
      is_disabled: false,
    });
    if (superError) {
      console.error('Error seeding SUPER_ADMIN:', superError);
    } else {
      console.log(`SUPER_ADMIN (${superEmail}) successfully created!`);
    }
  } else {
    // Update password
    await adminSupabase.from('users').update({ password_hash: superHash }).eq('email', superEmail);
    console.log(`SUPER_ADMIN (${superEmail}) password updated!`);
  }

  // Seed Master Admin
  const masterEmail = 'directoratulpatoliya@gmail.com';
  const masterPass = 'Admin@1234';
  const masterHash = await hashPassword(masterPass);

  const { data: existingMaster } = await adminSupabase
    .from('users')
    .select('id')
    .eq('email', masterEmail)
    .maybeSingle();

  if (!existingMaster) {
    const { error: masterError } = await adminSupabase.from('users').insert({
      email: masterEmail,
      password_hash: masterHash,
      role: 'MASTER_ADMIN',
      is_disabled: false,
    });
    if (masterError) {
      console.error('Error seeding MASTER_ADMIN:', masterError);
    } else {
      console.log(`MASTER_ADMIN (${masterEmail}) successfully created!`);
    }
  } else {
    // Update password
    await adminSupabase.from('users').update({ password_hash: masterHash }).eq('email', masterEmail);
    console.log(`MASTER_ADMIN (${masterEmail}) password updated!`);
  }
}

seed().catch(console.error);
