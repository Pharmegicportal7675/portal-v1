import { prisma } from '@/lib/prisma';
import { verifyStoredPassword } from '@/lib/auth/password';
import { loginSchema } from '@/lib/validations';
import type { SessionPayload } from '@/lib/auth/session';

type AuthSuccess = {
  ok: true;
  session: SessionPayload;
};

type AuthFailure = {
  ok: false;
  error: string;
};

export type AuthResult = AuthSuccess | AuthFailure;

function isAccountDisabled(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

export async function authenticateUser(
  email: string,
  password: string
): Promise<AuthResult> {
  const result = loginSchema.safeParse({ email, password });
  if (!result.success) {
    return { ok: false, error: result.error.issues[0].message };
  }

  const normalizedEmail = result.data.email.toLowerCase().trim();

  let user: {
    id: string;
    email: string;
    password_hash: string;
    login_password: string | null;
    role: string;
    client_id: string | null;
    is_disabled: boolean;
  } | null;

  try {
    user = await prisma.users.findFirst({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        password_hash: true,
        login_password: true,
        role: true,
        client_id: true,
        is_disabled: true,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error';
    console.error('[auth] Database error during login:', message);
    return { ok: false, error: 'Invalid email or password.' };
  }

  if (!user) {
    return { ok: false, error: 'Invalid email or password.' };
  }

  if (isAccountDisabled(user.is_disabled)) {
    return {
      ok: false,
      error: 'Your account has been disabled. Please contact the administrator.',
    };
  }

  const passwordCheck = await verifyStoredPassword(
    result.data.password,
    user.password_hash,
    user.login_password
  );

  if (!passwordCheck.ok) {
    return { ok: false, error: 'Invalid email or password.' };
  }

  if (passwordCheck.rehash) {
    try {
      await prisma.users.update({
        where: { id: user.id },
        data: {
          password_hash: passwordCheck.rehash,
          login_password: result.data.password,
        },
      });
    } catch (error) {
      console.error('[auth] Failed to rehash password for', user.email, error);
    }
  }

  return {
    ok: true,
    session: {
      userId: user.id,
      email: user.email,
      role: user.role as SessionPayload['role'],
      clientId: user.client_id ?? null,
    },
  };
}
