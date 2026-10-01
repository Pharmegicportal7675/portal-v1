import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@/generated/prisma';

function parseDatabaseUrl(databaseUrl: string) {
  const normalized = databaseUrl.replace(/^mysql:\/\//, 'http://');
  const url = new URL(normalized);
  const database = url.pathname.replace(/^\//, '');
  const connectionLimit = Number(url.searchParams.get('connection_limit') || '2');
  const connectTimeoutSeconds = Number(url.searchParams.get('connect_timeout') || '10');
  const connectTimeout = Number.isFinite(connectTimeoutSeconds) && connectTimeoutSeconds > 0
    ? connectTimeoutSeconds * 1000
    : 10000;

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    connectionLimit: Number.isFinite(connectionLimit) && connectionLimit > 0 ? connectionLimit : 2,
    // Keep the pool small and drop idle sockets. Hostinger rejects new logins once
    // max_user_connections is full, and the driver otherwise holds every slot open.
    minimumIdle: 0,
    idleTimeout: 15,
    connectTimeout,
    acquireTimeout: connectTimeout + 5000,
  };
}

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set.');
  }

  const adapter = new PrismaMariaDb(parseDatabaseUrl(databaseUrl));
  return new PrismaClient({ adapter });
}

const POOL_KEY = 'limit-2-idle-15-acquire-after-connect';
const HOURLY_LIMIT_BACKOFF_MS = 10 * 60 * 1000;
const HOURLY_LIMIT_ERROR =
  "User has exceeded the 'max_connections_per_hour' resource (current value: 500)";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaPoolKey: string | undefined;
  dbBlockedUntil: number | undefined;
};

function errorText(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) {
    const cause = (error as { cause?: unknown }).cause;
    return `${error.message}\n${errorText(cause)}`;
  }
  if (typeof error === 'object') {
    const record = error as { message?: unknown; originalMessage?: unknown; cause?: unknown };
    return `${String(record.message ?? '')}\n${String(record.originalMessage ?? '')}\n${errorText(record.cause)}`;
  }
  return String(error);
}

function isHourlyConnectionLimit(error: unknown): boolean {
  const text = errorText(error).toLowerCase();
  return text.includes('max_connections_per_hour') || text.includes('er_user_limit_reached');
}

function noteDatabaseConnectionError(error: unknown): void {
  if (!isHourlyConnectionLimit(error)) return;
  globalForPrisma.dbBlockedUntil = Date.now() + HOURLY_LIMIT_BACKOFF_MS;
  resetPrismaClient();
}

function assertDatabaseAvailable(): void {
  const blockedUntil = globalForPrisma.dbBlockedUntil ?? 0;
  if (Date.now() < blockedUntil) {
    throw new Error(HOURLY_LIMIT_ERROR);
  }
}

function callWithConnectionGuard(fn: (...args: unknown[]) => unknown, thisArg: unknown) {
  return (...args: unknown[]) => {
    assertDatabaseAvailable();
    try {
      const result = fn.apply(thisArg, args);
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        return (result as Promise<unknown>).catch((error: unknown) => {
          noteDatabaseConnectionError(error);
          throw error;
        });
      }
      return result;
    } catch (error) {
      noteDatabaseConnectionError(error);
      throw error;
    }
  };
}

function wrapDelegate(delegate: object): object {
  return new Proxy(delegate, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      return callWithConnectionGuard(value as (...args: unknown[]) => unknown, target);
    },
  });
}

/** Drop a wedged pool so the next query can open a fresh connection. */
export function resetPrismaClient(): void {
  const current = globalForPrisma.prisma;
  globalForPrisma.prisma = undefined;
  globalForPrisma.prismaPoolKey = undefined;
  if (current) {
    void current.$disconnect().catch(() => undefined);
  }
}

function getPrismaClient(): PrismaClient {
  if (globalForPrisma.prisma && globalForPrisma.prismaPoolKey === POOL_KEY) {
    return globalForPrisma.prisma;
  }

  if (globalForPrisma.prisma) {
    void globalForPrisma.prisma.$disconnect().catch(() => undefined);
  }

  const client = createPrismaClient();
  globalForPrisma.prisma = client;
  globalForPrisma.prismaPoolKey = POOL_KEY;
  return client;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    if (prop === '$disconnect') {
      const client = getPrismaClient();
      const value = Reflect.get(client as object, prop, receiver);
      return typeof value === 'function' ? value.bind(client) : value;
    }

    assertDatabaseAvailable();
    const client = getPrismaClient();
    const value = Reflect.get(client as object, prop, receiver);
    if (typeof value === 'function') {
      return callWithConnectionGuard(value as (...args: unknown[]) => unknown, client);
    }
    if (value && typeof value === 'object') {
      return wrapDelegate(value as object);
    }
    return value;
  },
});
