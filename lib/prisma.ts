import mariadb from 'mariadb';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@/generated/prisma';

const SHARED_CONNECTION_LIMIT = 1;

type ConnectionCreationError = {
  errno?: number;
  errors?: Array<{ errno?: number }>;
};

type ConnectionCreationHandler = (
  this: object,
  err: ConnectionCreationError,
  onSuccess: (...args: unknown[]) => void,
  onError: (...args: unknown[]) => void,
  timeoutEnd: number
) => void;

/**
 * Hostinger counts every new MySQL login toward max_connections_per_hour.
 * Errno 1226 is not fatal in the driver, so a single page retries every 500ms
 * and can spend the whole hourly budget. Fail that attempt immediately.
 */
function failFastOnHourlyConnectionLimit(): void {
  const probe = mariadb.createPool({
    host: '127.0.0.1',
    user: 'unused',
    connectionLimit: 1,
    minimumIdle: 0,
    idleTimeout: 0,
    acquireTimeout: 1,
    initializationTimeout: 1,
    connectTimeout: 1,
  });
  const proto = Object.getPrototypeOf(probe) as {
    _handleConnectionCreationError?: ConnectionCreationHandler;
    hourlyLimitFailFast?: boolean;
  };
  void probe.end().catch(() => undefined);

  if (!proto._handleConnectionCreationError || proto.hourlyLimitFailFast) return;

  const original = proto._handleConnectionCreationError;
  proto._handleConnectionCreationError = function (err, onSuccess, onError, timeoutEnd) {
    const errno = err?.errno ?? err?.errors?.[0]?.errno;
    if (errno === 1226) {
      return original.call(this, err, onSuccess, onError, 0);
    }
    return original.call(this, err, onSuccess, onError, timeoutEnd);
  };
  proto.hourlyLimitFailFast = true;
}

failFastOnHourlyConnectionLimit();

function parseDatabaseUrl(databaseUrl: string) {
  const normalized = databaseUrl.replace(/^mysql:\/\//, 'http://');
  const url = new URL(normalized);
  const database = url.pathname.replace(/^\//, '');
  const requestedLimit = Number(url.searchParams.get('connection_limit') || String(SHARED_CONNECTION_LIMIT));
  const connectionLimit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, SHARED_CONNECTION_LIMIT)
    : SHARED_CONNECTION_LIMIT;
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
    connectionLimit,
    // One socket stays open and is reused by every visitor. Closing it would
    // count as another hourly login on Hostinger.
    minimumIdle: 1,
    idleTimeout: 0,
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

const POOL_KEY = 'shared-1-idle-0-fail-fast-1226';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaPoolKey: string | undefined;
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
  // Drop the empty pool. Do not keep refusing later requests: an idle portal
  // has no open logins, and the next attempt should be allowed to succeed.
  resetPrismaClient();
}

function callWithConnectionGuard(fn: (...args: unknown[]) => unknown, thisArg: unknown) {
  return (...args: unknown[]) => {
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
