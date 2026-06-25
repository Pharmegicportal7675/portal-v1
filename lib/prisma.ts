import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@/generated/prisma';

function parseDatabaseUrl(databaseUrl: string) {
  const normalized = databaseUrl.replace(/^mysql:\/\//, 'http://');
  const url = new URL(normalized);
  const database = url.pathname.replace(/^\//, '');
  const connectionLimit = Number(url.searchParams.get('connection_limit') || '5');
  const connectTimeoutSeconds = Number(url.searchParams.get('connect_timeout') || '30');

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    connectionLimit: Number.isFinite(connectionLimit) && connectionLimit > 0 ? connectionLimit : 5,
    connectTimeout: Number.isFinite(connectTimeoutSeconds) && connectTimeoutSeconds > 0
      ? connectTimeoutSeconds * 1000
      : 30000,
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

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function getPrismaClient(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const client = createPrismaClient();
  globalForPrisma.prisma = client;
  return client;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrismaClient();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
