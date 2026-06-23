const { createAdminClient } = require('../lib/db/admin');
const { reconcileMissingTccCertificates } = require('../lib/tcc-certificate-issuance');
const { getTccApplications } = require('../services/db');

async function testQuery() {
  console.log('Initializing DB client...');
  const supabase = createAdminClient();

  try {
    console.log('Running reconcileMissingTccCertificates...');
    await reconcileMissingTccCertificates(supabase);
    console.log('Reconciliation done.');

    console.log('Running getTccApplications...');
    const applications = await getTccApplications(supabase, 'all', { euReachOnly: true });
    console.log(`getTccApplications successful, retrieved ${applications?.length || 0} applications.`);

    console.log('Running admin_settings query...');
    const adminSettingsResult = await supabase
      .from('admin_settings')
      .select('smtp_from, smtp_cc_default')
      .eq('id', 1)
      .maybeSingle();
    
    if (adminSettingsResult.error) {
      console.error('admin_settings query error:', adminSettingsResult.error);
    } else {
      console.log('admin_settings query successful:', adminSettingsResult.data);
    }

  } catch (err) {
    console.error('Exception thrown:', err);
  }
}

testQuery();
