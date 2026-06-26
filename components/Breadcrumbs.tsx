'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import { useLayoutStore } from '@/store/layout';
import React, { useEffect, useState } from 'react';

const routeMaps: Record<string, string> = {
  admin: 'Admin Portal',
  clients: 'Client Management',
  chemicals: 'Substance Inventory',
  templates: 'Document Templates',
  approvals: 'TCC Approvals',
  client: 'Client Portal',
  apply: 'Apply for TCC',
  certificates: 'My Certificates',
  'rc-certificates': 'CT Certificates',
  'rc-preview': 'CT Certificate Preview',
  super: 'Super Admin',
  'activity-logs': 'Activity Log',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only link segments that resolve to a real page (avoids prefetch 404s on partial paths). */
function segmentHref(segments: string[], index: number): string | null {
  const segment = segments[index];
  const url = `/${segments.slice(0, index + 1).join('/')}`;

  if (segment === 'rc-preview') return null;

  if (UUID_RE.test(segment)) {
    if (index >= 2 && segments[0] === 'admin' && segments[1] === 'clients') {
      return `/admin/clients/${segment}`;
    }
    return null;
  }

  return url;
}

export default function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);
  const { customBreadcrumb } = useLayoutStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (segments.length === 0) return null;

  if (!mounted) {
    return (
      <nav
        className="flex items-center space-x-2 text-xs font-semibold text-slate-500"
        aria-hidden
      >
        <span className="h-3.5 w-3.5" />
      </nav>
    );
  }

  if (customBreadcrumb) {
    return (
      <nav className="flex items-center space-x-2 text-xs font-semibold text-slate-500">
        <Link href="/" className="flex items-center gap-1 hover:text-primary transition-colors">
          <Home className="h-3.5 w-3.5" />
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />
        <span className="text-slate-800 font-bold truncate max-w-[150px] sm:max-w-[300px]" suppressHydrationWarning>
          {customBreadcrumb}
        </span>
      </nav>
    );
  }

  return (
    <nav className="flex items-center space-x-2 text-xs font-semibold text-slate-500">
      <Link href="/" className="flex items-center gap-1 hover:text-primary transition-colors">
        <Home className="h-3.5 w-3.5" />
      </Link>

      {segments.map((segment, index) => {
        const url = `/${segments.slice(0, index + 1).join('/')}`;
        const isLast = index === segments.length - 1;
        const href = isLast ? null : segmentHref(segments, index);
        const displayName = routeMaps[segment] || segment.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

        return (
          <React.Fragment key={url}>
            <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />
            {isLast || !href ? (
              <span
                className={
                  isLast
                    ? 'text-slate-800 font-bold truncate max-w-[150px] sm:max-w-[300px]'
                    : 'truncate max-w-[120px]'
                }
                suppressHydrationWarning
              >
                {displayName}
              </span>
            ) : (
              <Link href={href} className="hover:text-primary transition-colors truncate max-w-[120px]">
                {displayName}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
