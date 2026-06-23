/** Browser stub — realtime disabled; use server actions for data. */
const noopChannel = {
  on: () => noopChannel,
  subscribe: () => noopChannel,
};

export const createClient = () =>
  ({
    channel: () => noopChannel,
    removeChannel: () => undefined,
  }) as unknown as import('@supabase/supabase-js').SupabaseClient;
