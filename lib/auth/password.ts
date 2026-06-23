import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export async function hashPassword(plainText: string): Promise<string> {
  return bcrypt.hash(plainText, SALT_ROUNDS);
}

export async function verifyPassword(plainText: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainText, hash);
}

export type PasswordVerifyResult =
  | { ok: true; rehash?: string }
  | { ok: false };

/** Verify bcrypt hash first, then legacy plaintext login_password (self-heals hash on match). */
export async function verifyStoredPassword(
  plainText: string,
  passwordHash: string | null | undefined,
  loginPassword: string | null | undefined
): Promise<PasswordVerifyResult> {
  const hash = typeof passwordHash === 'string' ? passwordHash.trim() : '';
  if (hash) {
    try {
      if (await bcrypt.compare(plainText, hash)) {
        return { ok: true };
      }
    } catch {
      // Invalid hash in DB — fall through to login_password.
    }
  }

  if (loginPassword && plainText === loginPassword) {
    return { ok: true, rehash: await hashPassword(plainText) };
  }

  return { ok: false };
}
