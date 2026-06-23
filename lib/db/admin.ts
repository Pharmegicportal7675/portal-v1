import type { DbClient } from '@/lib/db/types';
import { createDbClient } from '@/lib/db/query-client';

/** Server-side MySQL client (admin actions, API routes, server components). */
export const createAdminClient = (): DbClient => createDbClient();
