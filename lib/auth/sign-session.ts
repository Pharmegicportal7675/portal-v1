import { SignJWT } from 'jose';
import { SESSION_MAX_AGE, getAuthSecret } from '@/lib/auth/constants';
import type { SessionPayload } from '@/lib/auth/session';

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getAuthSecret());
}
