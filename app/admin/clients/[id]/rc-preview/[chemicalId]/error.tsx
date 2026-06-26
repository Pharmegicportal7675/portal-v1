'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export default function ReachCertificatePreviewError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg space-y-4 rounded-xl border border-rose-100 bg-rose-50/50 p-6">
      <h2 className="text-lg font-bold text-slate-900">CT preview could not load</h2>
      <p className="text-sm text-slate-600">
        The certificate preview failed on the server. This is usually temporary — try again, or open
        the client profile and use CT preview from there.
      </p>
      {error.message ? (
        <p className="rounded-md bg-white px-3 py-2 text-xs font-mono text-rose-700">{error.message}</p>
      ) : null}
      <div className="flex flex-wrap gap-2 pt-2">
        <Button type="button" onClick={() => reset()}>
          Try again
        </Button>
        <Link href="/admin/rc-certificates">
          <Button type="button" variant="outline">
            Back to CT Certificates
          </Button>
        </Link>
      </div>
    </div>
  );
}
