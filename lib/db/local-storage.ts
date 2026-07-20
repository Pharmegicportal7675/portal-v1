import fs from 'fs/promises';
import path from 'path';
import {
  getPrimaryCertificatesUploadRoot,
  resolveCertificatesFilePath,
} from '@/lib/certificates-upload-root';

export const CERTIFICATES_BUCKET = 'certificates';

function resolveStorageFilePath(fileName: string): string {
  const relative = fileName.replace(/\\/g, '/').replace(/^\/+/, '');
  const existing = resolveCertificatesFilePath(relative);
  if (existing) return existing;

  const uploadRoot = getPrimaryCertificatesUploadRoot();
  return path.join(uploadRoot, ...relative.split('/').filter(Boolean));
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(getPrimaryCertificatesUploadRoot(), { recursive: true });
}

function publicUrl(fileName: string): string {
  const encoded = fileName
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  // Relative URL so previews work on whatever host the portal is opened from.
  return `/uploads/certificates/${encoded}`;
}

export function createLocalStorage() {
  return {
    listBuckets: async () => ({
      data: [{ name: CERTIFICATES_BUCKET, id: CERTIFICATES_BUCKET, public: true }],
      error: null,
    }),
    createBucket: async () => ({ data: { name: CERTIFICATES_BUCKET }, error: null }),
    from: (_bucket: string) => ({
      upload: async (
        fileName: string,
        body: Buffer | Blob | ArrayBuffer | File,
        options?: { contentType?: string; upsert?: boolean }
      ) => {
        try {
          await ensureDir();
          const filePath = resolveStorageFilePath(fileName);
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          if (!options?.upsert) {
            try {
              await fs.access(filePath);
              return { data: null, error: { message: 'The resource already exists' } };
            } catch {
              // file does not exist
            }
          }
          let buffer: Buffer;
          if (Buffer.isBuffer(body)) buffer = body;
          else if (body instanceof ArrayBuffer) buffer = Buffer.from(body);
          else if (typeof Blob !== 'undefined' && body instanceof Blob)
            buffer = Buffer.from(await body.arrayBuffer());
          else buffer = Buffer.from(await (body as File).arrayBuffer());
          await fs.writeFile(filePath, buffer);
          return { data: { path: fileName }, error: null };
        } catch (err) {
          return { data: null, error: { message: err instanceof Error ? err.message : 'Upload failed' } };
        }
      },
      download: async (fileName: string) => {
        try {
          const filePath = resolveStorageFilePath(fileName);
          const buffer = await fs.readFile(filePath);
          return { data: new Blob([buffer]), error: null };
        } catch (err) {
          return { data: null, error: { message: err instanceof Error ? err.message : 'Download failed' } };
        }
      },
      remove: async (paths: string[]) => {
        try {
          await Promise.all(
            paths.map(async (fileName) => {
              const filePath = resolveStorageFilePath(fileName);
              await fs.unlink(filePath).catch(() => undefined);
            })
          );
          return { data: paths, error: null };
        } catch (err) {
          return { data: null, error: { message: err instanceof Error ? err.message : 'Remove failed' } };
        }
      },
      list: async (prefix = '') => {
        try {
          await ensureDir();
          const uploadRoot = getPrimaryCertificatesUploadRoot();
          const entries = await fs.readdir(uploadRoot);
          const files = entries
            .filter((name) => name.startsWith(prefix))
            .map((name) => ({ name }));
          return { data: files, error: null };
        } catch (err) {
          return { data: null, error: { message: err instanceof Error ? err.message : 'List failed' } };
        }
      },
      getPublicUrl: (fileName: string) => ({
        data: { publicUrl: publicUrl(fileName) },
      }),
    }),
  };
}
