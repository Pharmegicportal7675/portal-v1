import type { SupabaseClient } from '@supabase/supabase-js';
import { createCompatClient } from '@/lib/db/supabase-compat';

export const createClient = async (): Promise<SupabaseClient> => createCompatClient();
