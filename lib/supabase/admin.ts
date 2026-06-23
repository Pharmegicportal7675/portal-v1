import type { SupabaseClient } from '@supabase/supabase-js';
import { createCompatClient } from '@/lib/db/supabase-compat';

/** MySQL-backed client with Supabase-compatible query API (database + local file storage). */
export const createAdminClient = (): SupabaseClient => createCompatClient();
