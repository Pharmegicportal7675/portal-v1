import { createAdminClient } from '@/lib/supabase/admin';
import { verifyPassword } from '@/lib/auth/password';
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

export async function authenticateUser(
  email: string,
  password: string
): Promise<AuthResult> {
  const result = loginSchema.safeParse({ email, password });
  if (!result.success) {
    return { ok: false, error: result.error.issues[0].message };
  }

  const supabase = createAdminClient();
  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, password_hash, role, client_id, is_disabled')
    .eq('email', result.data.email.toLowerCase().trim())
    .maybeSingle();

  if (error || !user) {
    return { ok: false, error: 'Invalid email or password.' };
  }

  if (user.is_disabled) {
    return {
      ok: false,
      error: 'Your account has been disabled. Please contact the administrator.',
    };
  }

  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    return { ok: false, error: 'Invalid email or password.' };
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
