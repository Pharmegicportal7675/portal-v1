import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/db/admin';
import { getSession } from '@/lib/auth/session';
import { formatErrorMessage } from '@/lib/format-error';
import { writeActivityLog } from '@/lib/activity-log';
import { getUserGuideUrl, setUserGuideUrl } from '@/lib/user-manual-storage';

export const runtime = 'nodejs';

function isAdminRole(role: string): boolean {
  return role === 'MASTER_ADMIN' || role === 'SUPER_ADMIN';
}

function normalizeGuideUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/** Read the configured User Guide URL — available to any signed-in user. */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const url = await getUserGuideUrl(createAdminClient());
    return NextResponse.json({ url: url ?? '' });
  } catch (err: unknown) {
    console.error('[user-guide-url GET]', err);
    return NextResponse.json(
      { error: formatErrorMessage(err) || 'Failed to load user guide URL.' },
      { status: 500 }
    );
  }
}

/** Set / clear the User Guide URL — master & super admins only. */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !isAdminRole(session.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
    const normalized = normalizeGuideUrl(body?.url);
    if (normalized === null) {
      return NextResponse.json(
        { error: 'Enter a valid URL starting with http:// or https://' },
        { status: 400 }
      );
    }

    const adminSupabase = createAdminClient();
    const previous = await getUserGuideUrl(adminSupabase);
    const saved = await setUserGuideUrl(adminSupabase, normalized);
    const cleared = !saved;

    await writeActivityLog(adminSupabase, {
      user_id: session.userId,
      action: 'USER_GUIDE_URL_UPDATED',
      entity_type: 'user_guide',
      description: cleared
        ? 'User Guide URL cleared'
        : `User Guide URL ${previous ? 'updated' : 'set'}: ${saved}`,
      metadata: {
        previous_url: previous || '',
        new_url: saved || '',
        cleared,
      },
    });

    return NextResponse.json({ success: true, url: saved ?? '' });
  } catch (err: unknown) {
    console.error('[user-guide-url POST]', err);
    return NextResponse.json(
      { error: formatErrorMessage(err) || 'Failed to save user guide URL.' },
      { status: 500 }
    );
  }
}
