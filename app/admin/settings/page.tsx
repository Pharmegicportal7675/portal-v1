import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTemplate } from '@/services/db';
import { getAdminSettingsAction } from '@/actions/settings';
import SettingsDashboard from '@/components/SettingsDashboard';

export const revalidate = 0; // Live settings refresh

export default async function SettingsPage() {
  const supabase = createAdminClient();
  
  // Fetch active template
  const template = await getActiveTemplate(supabase);
  
  // Fetch admin settings via action helper
  const settingsRes = await getAdminSettingsAction();
  const settings = settingsRes.success ? settingsRes.settings : null;

  return (
    <SettingsDashboard
      initialSettings={settings}
      initialTemplate={template}
    />
  );
}
