/** MySQL query client (chainable `.from()` API used across the app). */
export type DbClient = {
  from: (table: string) => DbQueryBuilder;
  storage: DbStorageClient;
  auth: {
    getUser: () => Promise<{ data: { user: null }; error: null }>;
    signOut: () => Promise<{ error: null }>;
  };
  channel: (name: string) => DbRealtimeChannel;
  removeChannel: (channel: unknown) => void;
};

export type DbRealtimeChannel = {
  on: (...args: unknown[]) => DbRealtimeChannel;
  subscribe: (...args: unknown[]) => DbRealtimeChannel;
};

export type DbStorageClient = {
  from: (bucket: string) => {
    upload: (
      path: string,
      file: Buffer | Blob | ArrayBuffer,
      options?: { contentType?: string; upsert?: boolean }
    ) => Promise<{ data: { path: string } | null; error: { message: string } | null }>;
    download: (path: string) => Promise<{ data: Blob | null; error: { message: string } | null }>;
    remove: (paths: string[]) => Promise<{ data: unknown; error: { message: string } | null }>;
    list: (prefix?: string, options?: { limit?: number }) => Promise<{ data: { name: string }[] | null; error: { message: string } | null }>;
    getPublicUrl: (path: string) => { data: { publicUrl: string } };
  };
};

export type DbQueryBuilder = {
  select: (columns?: string, options?: { count?: 'exact'; head?: boolean }) => DbQueryBuilder;
  insert: (payload: unknown) => DbQueryBuilder;
  upsert: (payload: unknown, options?: { onConflict?: string }) => DbQueryBuilder;
  update: (payload: unknown) => DbQueryBuilder;
  delete: () => DbQueryBuilder;
  eq: (field: string, value: unknown) => DbQueryBuilder;
  neq: (field: string, value: unknown) => DbQueryBuilder;
  in: (field: string, value: unknown[]) => DbQueryBuilder;
  ilike: (field: string, pattern: string) => DbQueryBuilder;
  or: (expr: string) => DbQueryBuilder;
  is: (field: string, value: null) => DbQueryBuilder;
  order: (field: string, options?: { ascending?: boolean }) => DbQueryBuilder;
  range: (from: number, to: number) => DbQueryBuilder;
  limit: (n: number) => DbQueryBuilder;
  single: () => DbQueryBuilder;
  maybeSingle: () => DbQueryBuilder;
  then: <T>(
    onfulfilled?: ((value: DbResult<any>) => T | PromiseLike<T>) | null,
    onrejected?: ((reason: unknown) => unknown) | null
  ) => Promise<T>;
};

export type DbResult<T> = {
  data: T;
  error: { message: string; code?: string; details?: string } | null;
  count?: number | null;
};
