import type { DbClient } from '@/lib/db/types';
import { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/prisma';
import { createLocalStorage } from '@/lib/db/local-storage';

type DbError = { message: string; code?: string; details?: string };
type DbResult<T> = { data: T; error: DbError | null; count?: number | null };

const JSON_FIELDS = new Set([
  'regulatory_registrations',
  'metadata',
  'mail_sent_history',
]);

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_FIELD_PATTERN = /(_at|_date)$/;

/** Prisma DateTime/@db.Date fields reject bare YYYY-MM-DD — convert for MySQL writes. */
function toPrismaDateTime(value: unknown, fieldKey?: string): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (DATE_ONLY_PATTERN.test(trimmed)) {
      return new Date(`${trimmed}T00:00:00.000Z`);
    }
    const parsed = Date.parse(trimmed);
    if (
      !Number.isNaN(parsed) &&
      (trimmed.includes('T') || (fieldKey ? DATE_FIELD_PATTERN.test(fieldKey) : false))
    ) {
      return new Date(parsed);
    }
  }
  return value;
}

function prepareValueForWrite(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;

  const dateValue = toPrismaDateTime(value, key);
  if (dateValue !== value) return dateValue;

  if (JSON_FIELDS.has(key) && typeof value !== 'string') {
    return JSON.stringify(value);
  }

  return value;
}

const RELATION_ALIASES: Record<string, string> = {
  certificates_certificates_tcc_application_idTotcc_applications: 'certificates',
  tcc_applications_certificates_tcc_application_idTotcc_applications: 'tcc_applications',
  certificates_tcc_applications_reach_certificate_idTocertificates: 'reach_certificate',
};

const FK_HINTS: Record<string, Record<string, { relation: string; alias: string }>> = {
  tcc_applications: {
    certificates_tcc_application_id_fkey: {
      relation: 'certificates_certificates_tcc_application_idTotcc_applications',
      alias: 'certificates',
    },
  },
  certificates: {
    certificates_tcc_application_id_fkey: {
      relation: 'tcc_applications_certificates_tcc_application_idTotcc_applications',
      alias: 'tcc_applications',
    },
  },
  internal_notes: {
    internal_notes_author_id_fkey: { relation: 'users', alias: 'users' },
  },
};

function toError(err: unknown): DbError {
  if (err instanceof Error) return { message: err.message, code: (err as { code?: string }).code };
  return { message: 'Unknown database error' };
}

function isDecimal(value: unknown): value is Prisma.Decimal {
  if (value instanceof Prisma.Decimal) return true;
  return (
    typeof value === 'object' &&
    value !== null &&
    'd' in value &&
    'e' in value &&
    's' in value &&
    typeof (value as { toNumber?: unknown }).toNumber === 'function'
  );
}

function serializeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return Number(value);
  if (isDecimal(value)) return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serializeValue(v);
    }
    return out;
  }
  return value;
}

function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (JSON_FIELDS.has(key) && typeof value === 'string') {
      try {
        out[key] = JSON.parse(value);
      } catch {
        out[key] = value;
      }
      continue;
    }
    const alias = RELATION_ALIASES[key] ?? key;
    if (isDecimal(value)) {
      out[alias] = Number(value);
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      out[alias] = serializeRow(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      out[alias] = value.map((item) =>
        item && typeof item === 'object' ? serializeRow(item as Record<string, unknown>) : serializeValue(item)
      );
    } else {
      out[alias] = serializeValue(value);
    }
  }
  return out;
}

/** Convert JSON-backed LongText fields and date-only strings for Prisma writes. */
function prepareRowForWrite(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = prepareValueForWrite(key, value);
  }
  return out;
}

type Filter =
  | { kind: 'eq'; field: string; value: unknown }
  | { kind: 'neq'; field: string; value: unknown }
  | { kind: 'in'; field: string; value: unknown[] }
  | { kind: 'ilike'; field: string; pattern: string }
  | { kind: 'or'; expr: string }
  | { kind: 'is'; field: string; value: null };

type Order = { field: string; ascending: boolean };

function parseOrExpression(expr: string): Record<string, unknown>[] {
  return expr.split(',').map((part) => {
    const trimmed = part.trim();
    const isNull = trimmed.match(/^([^.]+)\.is\.null$/);
    if (isNull) return { [isNull[1]]: null };
    const eq = trimmed.match(/^([^.]+)\.eq\.(.+)$/);
    if (eq) return { [eq[1]]: eq[2] };
    const ilike = trimmed.match(/^([^.]+)\.ilike\.(.+)$/);
    if (ilike) {
      const pattern = ilike[2].replace(/%/g, '');
      return { [ilike[1]]: { contains: pattern, mode: 'insensitive' as const } };
    }
    return {};
  });
}

function buildWhere(filters: Filter[]): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  const orGroups: Record<string, unknown>[][] = [];

  for (const filter of filters) {
    if (filter.kind === 'eq') where[filter.field] = toPrismaDateTime(filter.value);
    if (filter.kind === 'neq') where[filter.field] = { not: toPrismaDateTime(filter.value) };
    if (filter.kind === 'in') {
      where[filter.field] = {
        in: filter.value.map((item) => toPrismaDateTime(item)),
      };
    }
    if (filter.kind === 'ilike') where[filter.field] = { contains: filter.pattern, mode: 'insensitive' };
    if (filter.kind === 'is' && filter.value === null) where[filter.field] = null;
    if (filter.kind === 'or') orGroups.push(parseOrExpression(filter.expr));
  }

  if (orGroups.length === 1) where.OR = orGroups[0];
  else if (orGroups.length > 1) where.AND = orGroups.map((group) => ({ OR: group }));

  return where;
}

function parseFieldsList(fields: string): Record<string, boolean> | null {
  const trimmed = fields.trim();
  if (trimmed === '*') return null;
  const select: Record<string, boolean> = {};
  for (const field of trimmed.split(',').map((f) => f.trim()).filter(Boolean)) {
    if (field === '*') continue;
    select[field] = true;
  }
  return Object.keys(select).length > 0 ? select : null;
}

function splitTopLevelSegments(input: string): string[] {
  const segments: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of input) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (char === ',' && depth === 0) {
      if (current.trim()) segments.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) segments.push(current.trim());
  return segments;
}

/** Parse mixed scalar fields and nested relations inside one parenthesis block. */
function parseSelectContent(
  content: string,
  parentTable: string
): { select?: Record<string, boolean>; include?: Record<string, unknown> } {
  const select: Record<string, boolean> = {};
  const include: Record<string, unknown> = {};

  for (const segment of splitTopLevelSegments(content)) {
    if (segment.includes('(')) {
      const { name, hint, fields } = parseRelationSegment(segment);
      if (!name || name === '*') continue;
      const hintMap = FK_HINTS[parentTable]?.[hint ?? ''];
      const relationName = hintMap?.relation ?? name;
      include[relationName] = buildRelationInclude(fields, name, relationName);
    } else {
      const field = segment.trim();
      if (field && field !== '*') select[field] = true;
    }
  }

  const result: { select?: Record<string, boolean>; include?: Record<string, unknown> } = {};
  if (Object.keys(select).length > 0) result.select = select;
  if (Object.keys(include).length > 0) result.include = include;
  return result;
}

function toPrismaRelationShape(
  parsed: { select?: Record<string, boolean>; include?: Record<string, unknown> }
): Record<string, unknown> | boolean {
  const hasSelect = parsed.select && Object.keys(parsed.select).length > 0;
  const hasInclude = parsed.include && Object.keys(parsed.include).length > 0;

  if (hasSelect && hasInclude) {
    // Prisma forbids select + include at the same level — nest relations inside select.
    const select: Record<string, unknown> = { ...parsed.select };
    for (const [key, val] of Object.entries(parsed.include!)) {
      select[key] = val;
    }
    return { select };
  }

  if (hasInclude) return { include: parsed.include };
  if (hasSelect) return { select: parsed.select };
  return true;
}

function buildRelationInclude(
  fields: string,
  table: string,
  _relationName: string
): Record<string, unknown> | boolean {
  const trimmed = fields.trim();
  if (trimmed === '*') return true;

  if (trimmed.includes('(')) {
    return toPrismaRelationShape(parseSelectContent(trimmed, table));
  }

  const fieldSelect = parseFieldsList(trimmed);
  if (!fieldSelect) return true;
  return { select: fieldSelect };
}

function parseRelationSegment(segment: string): { name: string; hint?: string; fields: string } {
  const bang = segment.indexOf('!');
  if (bang === -1) {
    const paren = segment.indexOf('(');
    if (paren === -1) return { name: segment.trim(), fields: '*' };
    return {
      name: segment.slice(0, paren).trim(),
      fields: segment.slice(paren + 1, -1).trim() || '*',
    };
  }
  const name = segment.slice(0, bang).trim();
  const rest = segment.slice(bang + 1);
  const paren = rest.indexOf('(');
  const hint = paren === -1 ? rest.trim() : rest.slice(0, paren).trim();
  const fields = paren === -1 ? '*' : rest.slice(paren + 1, -1).trim() || '*';
  return { name, hint, fields };
}

function parseSelect(
  select: string,
  table: string
): { include?: Record<string, unknown>; select?: Record<string, unknown> } {
  const trimmed = select.trim();
  if (trimmed === '*') return {};

  // Plain column list without relations, e.g. "country, status"
  if (!trimmed.includes('(')) {
    if (trimmed.startsWith('*,') || trimmed.startsWith('*\n')) {
      // fall through to relation parsing below
    } else {
      const cols = parseFieldsList(trimmed);
      return cols ? { select: cols } : {};
    }
  }

  const hasLeadingStar = /^\*,/.test(trimmed) || /^\*\n/.test(trimmed);

  // e.g. "id, client_id, clients ( company_name )" — top-level select, not include
  if (!hasLeadingStar) {
    const shape = toPrismaRelationShape(parseSelectContent(trimmed, table));
    if (shape === true) return {};
    if (typeof shape === 'object' && 'select' in shape) return { select: shape['select'] as Record<string, unknown> };
    if (typeof shape === 'object' && 'include' in shape) return { include: shape['include'] as Record<string, unknown> };
    return {};
  }

  const include: Record<string, unknown> = {};
  const top = trimmed.replace(/^\*,\s*/, '');

  for (const segment of splitTopLevelSegments(top)) {
    const { name, hint, fields } = parseRelationSegment(segment);
    if (!name || name === '*') continue;
    const hintMap = FK_HINTS[table]?.[hint ?? ''];
    const relationName = hintMap?.relation ?? name;
    include[relationName] = buildRelationInclude(fields, name, relationName);
  }

  return { include };
}

function getDelegate(table: string) {
  const delegate = (prisma as unknown as Record<string, unknown>)[table];
  if (!delegate) throw new Error(`Unknown table: ${table}`);
  return delegate as {
    findMany: (args?: unknown) => Promise<unknown[]>;
    findFirst: (args?: unknown) => Promise<unknown | null>;
    count: (args?: unknown) => Promise<number>;
    create: (args: unknown) => Promise<unknown>;
    createMany: (args: unknown) => Promise<unknown>;
    upsert: (args: unknown) => Promise<unknown>;
    update: (args: unknown) => Promise<unknown>;
    updateMany: (args: unknown) => Promise<unknown>;
    delete: (args: unknown) => Promise<unknown>;
    deleteMany: (args: unknown) => Promise<unknown>;
  };
}

class QueryBuilder {
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private skip?: number;
  private take?: number;
  private selectStr = '*';
  private countOnly = false;
  private mode: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private payload: unknown;
  private upsertConflictField?: string;
  private wantSingle = false;
  private wantMaybeSingle = false;
  private returning = false;

  constructor(private readonly table: string) {}

  select(columns = '*', options?: { count?: 'exact'; head?: boolean }) {
    if (this.mode === 'insert' || this.mode === 'update') {
      this.selectStr = columns;
      this.returning = true;
      return this;
    }
    this.selectStr = columns;
    if (options?.count === 'exact' && options?.head) this.countOnly = true;
    return this;
  }

  insert(payload: unknown) {
    this.mode = 'insert';
    this.payload = payload;
    return this;
  }

  upsert(payload: unknown, options?: { onConflict?: string }) {
    this.mode = 'upsert';
    this.payload = payload;
    this.upsertConflictField = options?.onConflict;
    return this;
  }

  update(payload: unknown) {
    this.mode = 'update';
    this.payload = payload;
    return this;
  }

  delete() {
    this.mode = 'delete';
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ kind: 'eq', field, value });
    return this;
  }

  neq(field: string, value: unknown) {
    this.filters.push({ kind: 'neq', field, value });
    return this;
  }

  in(field: string, value: unknown[]) {
    this.filters.push({ kind: 'in', field, value });
    return this;
  }

  ilike(field: string, pattern: string) {
    this.filters.push({ kind: 'ilike', field, pattern });
    return this;
  }

  or(expr: string) {
    this.filters.push({ kind: 'or', expr });
    return this;
  }

  is(field: string, value: null) {
    this.filters.push({ kind: 'is', field, value });
    return this;
  }

  order(field: string, options?: { ascending?: boolean }) {
    this.orders.push({ field, ascending: options?.ascending !== false });
    return this;
  }

  range(from: number, to: number) {
    this.skip = from;
    this.take = to - from + 1;
    return this;
  }

  limit(n: number) {
    this.take = n;
    return this;
  }

  single() {
    this.wantSingle = true;
    return this;
  }

  maybeSingle() {
    this.wantMaybeSingle = true;
    return this;
  }

  async then<TResult1 = DbResult<unknown>, TResult2 = never>(
    onfulfilled?: ((value: DbResult<unknown>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    try {
      const result = await this.execute();
      return onfulfilled ? onfulfilled(result) : (result as TResult1);
    } catch (reason) {
      if (onrejected) return onrejected(reason);
      throw reason;
    }
  }

  private async execute(): Promise<DbResult<unknown>> {
    const delegate = getDelegate(this.table);
    const where = buildWhere(this.filters);
    const orderBy = this.orders.map((o) => ({ [o.field]: o.ascending ? 'asc' : 'desc' }));

    try {
      if (this.mode === 'insert') {
        const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row) =>
          prepareRowForWrite(row as Record<string, unknown>)
        );
        if (rows.length === 1) {
          const created = await delegate.create({ data: rows[0] });
          const data = serializeRow(created as Record<string, unknown>);
          return { data: this.wantSingle || this.wantMaybeSingle ? data : [data], error: null };
        }
        const createdRows: Record<string, unknown>[] = [];
        for (const row of rows) {
          const created = await delegate.create({ data: row });
          createdRows.push(serializeRow(created as Record<string, unknown>));
        }
        return { data: createdRows, error: null };
      }

      if (this.mode === 'upsert') {
        const data = prepareRowForWrite(this.payload as Record<string, unknown>);
        const conflictField = this.upsertConflictField ?? 'id';
        const conflictValue = data[conflictField];
        const upsertWhere = { [conflictField]: conflictValue };
        const upserted = await delegate.upsert({ where: upsertWhere, create: data, update: data });
        return { data: serializeRow(upserted as Record<string, unknown>), error: null };
      }

      if (this.mode === 'update') {
        const writeData = prepareRowForWrite(this.payload as Record<string, unknown>);
        const id = where.id;
        if (id !== undefined) {
          const updated = await delegate.update({
            where: { id },
            data: writeData,
          });
          const row = serializeRow(updated as Record<string, unknown>);
          return { data: this.returning ? row : null, error: null };
        }
        await delegate.updateMany({ where, data: writeData });
        return { data: null, error: null };
      }

      if (this.mode === 'delete') {
        const id = where.id;
        if (id !== undefined) {
          await delegate.delete({ where: { id } });
          return { data: null, error: null };
        }
        await delegate.deleteMany({ where });
        return { data: null, error: null };
      }

      if (this.countOnly) {
        const count = await delegate.count({ where });
        return { data: null, error: null, count };
      }

      const parsed = parseSelect(this.selectStr, this.table);
      const args: Record<string, unknown> = { where };
      if (orderBy.length) args.orderBy = orderBy;
      if (this.skip !== undefined) args.skip = this.skip;
      if (this.take !== undefined) args.take = this.take;
      if (parsed.select) args.select = parsed.select;
      if (parsed.include && Object.keys(parsed.include).length > 0) {
        args.include = parsed.include;
      }

      if (this.wantSingle || this.wantMaybeSingle) {
        const row = await delegate.findFirst(args);
        if (!row && this.wantSingle) {
          return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
        }
        return { data: row ? serializeRow(row as Record<string, unknown>) : null, error: null };
      }

      const rows = await delegate.findMany(args);
      const data = (rows as Record<string, unknown>[]).map(serializeRow);
      if (this.skip !== undefined || this.take !== undefined) {
        const count = await delegate.count({ where });
        return { data, error: null, count };
      }
      return { data, error: null };
    } catch (err) {
      return { data: null, error: toError(err) };
    }
  }
}

export function createDbClient(): DbClient {
  const storage = createLocalStorage();
  const client = {
    from: (table: string) => new QueryBuilder(table),
    storage,
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      signOut: async () => ({ error: null }),
    },
  };
  return client as unknown as DbClient;
}
