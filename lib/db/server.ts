import type { DbClient } from '@/lib/db/types';
import { createDbClient } from '@/lib/db/query-client';

export const createClient = async (): Promise<DbClient> => createDbClient();
