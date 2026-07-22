import { createAdminClient } from '@/lib/db/admin';
import { getActiveTemplate } from '@/services/db';
import { getAdminSettingsAction } from '@/actions/settings';
import { getUserManualManifest, getUserGuideUrl } from '@/lib/user-manual-storage';
import { getSession } from '@/lib/auth/session';
import SettingsDashboard from '@/components/SettingsDashboard';

export const revalidate = 0; // Live settings refresh

export default async function SettingsPage() {
  const session = await getSession();
  const supabase = createAdminClient();
  
  // Fetch active template
  const template = await getActiveTemplate(supabase);
  
  // Fetch admin settings via action helper
  const settingsRes = await getAdminSettingsAction();
  const settings = settingsRes.success ? settingsRes.settings : null;

  const [userManual, userGuideUrl] = await Promise.all([
    getUserManualManifest(supabase),
    getUserGuideUrl(supabase),
  ]);

  return (
    <SettingsDashboard
      initialSettings={settings}
      initialTemplate={template}
      initialUserManual={userManual}
      initialUserGuideUrl={userGuideUrl ?? ''}
      currentUserRole={session?.role ?? null}
    />
  );
}
