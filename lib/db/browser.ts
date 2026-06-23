import type { DbClient, DbRealtimeChannel } from '@/lib/db/types';

/** Browser stub — no direct DB access; use server actions for data. */
const noopChannel: DbRealtimeChannel = {
  on: () => noopChannel,
  subscribe: () => noopChannel,
};

export const createClient = (): DbClient =>
  ({
    channel: () => noopChannel,
    removeChannel: () => undefined,
  }) as unknown as DbClient;
