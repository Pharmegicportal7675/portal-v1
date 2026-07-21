import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { regenerateMissingTccCertificateFiles } from '@/lib/regenerate-tcc-certificate-file';
import { cleanupOrphanCertificateFiles } from '@/lib/cleanup-orphan-certificate-files';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

export const runtime = 'nodejs';
export const maxDuration = 300;

function isAuthorized(request: NextRequest, session: Awaited<ReturnType<typeof getSession>>): boolean {
  const secret = process.env.REPAIR_ATTACHMENTS_SECRET?.trim();
  if (secret) {
    const header = request.headers.get('x-repair-secret')?.trim();
    const query = new URL(request.url).searchParams.get('secret')?.trim();
    if (header === secret || query === secret) return true;
  }

  return Boolean(
    session && (session.role === 'MASTER_ADMIN' || session.role === 'SUPER_ADMIN')
  );
}

function runEnsureFoldersScript(): { ok: boolean; output: string } {
  const script = path.join(process.cwd(), 'scripts', 'ensure-live-folder-structure.mjs');
  const result = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
  });
  return {
    ok: result.status === 0,
    output: `${result.stdout || ''}${result.stderr || ''}`.trim(),
  };
}

/**
 * Live repair:
 *   POST { "mode": "tcc" } — regenerate missing TCC PDFs (add-only)
 *   POST { "mode": "folders" } — ensure Client/Year/PO|RC|TCC folders exist
 *   POST { "mode": "orphans", "folder": "COLORS_INDIA", "apply": true } — delete orphan PDFs
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!isAuthorized(request, session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { mode?: string; folder?: string; apply?: boolean } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      body = {};
    }

    const mode = body.mode || new URL(request.url).searchParams.get('mode') || 'tcc';

    if (mode === 'folders') {
      const result = runEnsureFoldersScript();
      return NextResponse.json({
        ok: result.ok,
        message: 'Ensured live certificate folder structure (Client/Year/PO|RC|TCC).',
        output: result.output,
      });
    }

    if (mode === 'orphans') {
      const folder =
        body.folder || new URL(request.url).searchParams.get('folder') || undefined;
      const apply =
        body.apply === true ||
        new URL(request.url).searchParams.get('apply') === '1';
      const result = await cleanupOrphanCertificateFiles({
        dryRun: !apply,
        folder,
      });
      return NextResponse.json({
        ok: true,
        message: apply
          ? 'Orphan certificate files deleted on live disk (DB untouched).'
          : 'Orphan certificate files listed (dry-run). Pass apply:true to delete.',
        ...result,
      });
    }

    const result = await regenerateMissingTccCertificateFiles();
    return NextResponse.json({
      ok: true,
      message: 'Live attachment repair completed (add-only).',
      ...result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Live repair failed.';
    console.error('[api/admin/repair-attachments]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
