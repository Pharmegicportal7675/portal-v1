import type { Metadata } from 'next';
import { Download } from 'lucide-react';
import { createAdminClient } from '@/lib/db/admin';
import { getUserManualManifest } from '@/lib/user-manual-storage';
import BrandLogo from '@/components/BrandLogo';
import UserManualContent from '@/components/UserManualContent';

export const revalidate = 0;

const MANUAL_TITLE = 'User Manual — Pharmegic Healthcare';
const MANUAL_DESCRIPTION = 'Step-by-step guide to using the Pharmegic Healthcare compliance portal.';

export const metadata: Metadata = {
  title: MANUAL_TITLE,
  description: MANUAL_DESCRIPTION,
  openGraph: {
    title: MANUAL_TITLE,
    description: MANUAL_DESCRIPTION,
    url: '/usermanual',
    siteName: 'Pharmegic Healthcare',
    images: [{ url: '/pharmegic-logo.png', alt: 'Pharmegic Healthcare' }],
    type: 'article',
  },
  twitter: {
    card: 'summary',
    title: MANUAL_TITLE,
    description: MANUAL_DESCRIPTION,
    images: ['/pharmegic-logo.png'],
  },
};

export default async function UserManualPage() {
  const manual = await getUserManualManifest(createAdminClient());

  return (
    <div className="h-screen overflow-y-auto bg-slate-50">
      <header className="border-b border-slate-100 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <BrandLogo variant="icon" href="" className="h-11 w-11" />
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-800">User Manual</h1>
              <p className="text-sm text-slate-500">
                Pharmegic Healthcare Compliance &amp; TCC Certificate Portal
              </p>
              <p className="mt-0.5 text-xs text-slate-400">Version 1.0.0 &middot; Client Representative Guide</p>
            </div>
          </div>
          {manual && (
            <a
              href="/api/user-manual"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Download className="h-4 w-4" />
              Download Offline Copy
            </a>
          )}
        </div>
      </header>

      <UserManualContent />

      <footer className="border-t border-slate-100 bg-white py-6 text-center text-xs text-slate-400">
        This page is public — no login required. &copy; {new Date().getFullYear()} Pharmegic Healthcare.
      </footer>
    </div>
  );
}
