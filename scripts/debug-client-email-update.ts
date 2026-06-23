import { createAdminClient } from '../lib/db/admin';

async function main() {
  const clientId = '7281825f-6eda-11f1-b711-023f3757104b';
  const admin = createAdminClient();

  const { data: before } = await admin.from('clients').select('email').eq('id', clientId).single();
  console.log('before clients.email:', before?.email);

  const testEmail = 'test-update-' + Date.now() + '@example.com';

  const { error: cErr } = await admin
    .from('clients')
    .update({ email: testEmail, updated_at: new Date() })
    .eq('id', clientId);
  console.log('clients update error:', cErr);

  const { data: after } = await admin.from('clients').select('email').eq('id', clientId).single();
  console.log('after clients.email:', after?.email);

  // rollback
  if (before?.email) {
    await admin.from('clients').update({ email: before.email, updated_at: new Date() }).eq('id', clientId);
    console.log('rolled back to:', before.email);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
