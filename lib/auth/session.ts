import { cache } from 'react';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { SESSION_COOKIE, getAuthSecret } from '@/lib/auth/constants';
import { SESSION_COOKIE_OPTIONS } from '@/lib/auth/cookie-options';
import { signSessionToken } from '@/lib/auth/sign-session';

export interface SessionPayload {
  userId: string;
  email: string;
  role: 'SUPER_ADMIN' | 'MASTER_ADMIN' | 'CLIENT';
  clientId?: string | null;
}

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await signSessionToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
}

async function reconcileSessionWithDatabase(
  session: SessionPayload
): Promise<SessionPayload | null> {
  const emailLower = session.email.toLowerCase().trim();

  const user = await prisma.users.findFirst({
    where: {
      OR: [{ id: session.userId }, { email: emailLower }],
    },
    select: {
      id: true,
      email: true,
      role: true,
      client_id: true,
      is_disabled: true,
    },
  });

  if (!user || user.is_disabled) return null;

  return {
    userId: user.id,
    email: user.email,
    role: user.role as SessionPayload['role'],
    clientId: user.client_id ?? null,
  };
}

export const getSession = cache(async (): Promise<SessionPayload | null> => {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, getAuthSecret());
    const jwtSession = payload as unknown as SessionPayload;

    const reconciled = await reconcileSessionWithDatabase(jwtSession);
    if (reconciled) return reconciled;

    // Trust a valid signed JWT when DB reconciliation is temporarily unavailable
    if (jwtSession.userId && jwtSession.email && jwtSession.role) {
      return jwtSession;
    }

    return null;
  } catch {
    return null;
  }
});

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete({ name: SESSION_COOKIE, path: SESSION_COOKIE_OPTIONS.path });
}
