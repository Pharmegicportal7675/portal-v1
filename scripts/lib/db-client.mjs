/** Shared MySQL client for CLI scripts (requires DATABASE_URL + npx tsx). */
export async function createAdminClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required in .env.local or .env');
  }
  const { createDbClient } = await import('../../lib/db/query-client.ts');
  return createDbClient();
}
