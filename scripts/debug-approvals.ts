import { createAdminClient } from '../lib/db/admin';
import { getTccApplications } from '../services/db';

async function main() {
  const supabase = createAdminClient();
  try {
    const apps = await getTccApplications(supabase, 'all', { euReachOnly: true });
    console.log('applications:', apps.length);
    if (apps[0]) console.log('sample keys:', Object.keys(apps[0] as object));
  } catch (err) {
    console.error('FAILED:', err);
    process.exit(1);
  }
}

main();
