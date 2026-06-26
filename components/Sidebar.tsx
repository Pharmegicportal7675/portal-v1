'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLayoutStore } from '@/store/layout';
import {
  LayoutDashboard,
  Users,
  Database,
  FileText,
  CheckSquare,
  FileSignature,
  Award,
  X,
  Shield,
  Settings,
  History,
} from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { useEffect } from 'react';
import {
  clientHasEuReachRegistration,
  normalizeRegulatoryRegistrations,
  type RegulatoryRegistration,
} from '@/lib/regulatory-registrations';

interface SidebarProps {
  role: 'SUPER_ADMIN' | 'MASTER_ADMIN' | 'CLIENT';
  companyName?: string;
  regulatoryRegistrations?: RegulatoryRegistration[];
}

const CLIENT_PROFILE_PATH = /^\/admin\/clients\/(?!new(?:\/|$))([^/]+)/;

export default function Sidebar({ role, companyName, regulatoryRegistrations = [] }: SidebarProps) {
  const pathname = usePathname();
  const { isSidebarOpen, setSidebarOpen, customBreadcrumb } = useLayoutStore();

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname, setSidebarOpen]);

  const adminLinks = [
    { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/clients', label: 'Clients', icon: Users },
    { href: '/admin/rc-certificates', label: 'RC Certificate', icon: FileText },
    { href: '/admin/approvals', label: 'TCC Approvals', icon: CheckSquare },
    { href: '/admin/settings', label: 'Settings', icon: Settings },
  ];

  if (role === 'SUPER_ADMIN') {
    const settingsIndex = adminLinks.findIndex((link) => link.href === '/admin/settings');
    adminLinks.splice(settingsIndex, 0, { href: '/admin/activity-logs', label: 'Activity Log', icon: History });
    adminLinks.splice(settingsIndex, 0, { href: '/admin/super', label: 'Super Admin', icon: Shield });
  }

  const clientProfileMatch = pathname.match(CLIENT_PROFILE_PATH);
  const clientProfileId = clientProfileMatch?.[1] ?? null;
  const isClientProfileView = Boolean(clientProfileId);

  const clientProfileHiddenHrefs = new Set([
    '/admin',
    '/admin/rc-certificates',
    '/admin/approvals',
    '/admin/settings',
    '/admin/super',
    '/admin/activity-logs',
  ]);

  const filteredAdminLinks = isClientProfileView
    ? adminLinks.filter((link) => !clientProfileHiddenHrefs.has(link.href))
    : adminLinks;

  const clientRegistrations = normalizeRegulatoryRegistrations(regulatoryRegistrations);
  const clientHasEuReach = clientHasEuReachRegistration(clientRegistrations);
  const clientHasAnyRegistration = clientRegistrations.length > 0;

  const clientLinks = [
    { href: '/client', label: 'Dashboard', icon: LayoutDashboard },
    ...(clientHasAnyRegistration
      ? [{ href: '/client/apply', label: 'Apply for TCC', icon: FileSignature }]
      : []),
    ...(clientHasEuReach
      ? [{ href: '/client/certificates', label: 'My Certificates', icon: Award }]
      : []),
  ];

  const links =
    role === 'SUPER_ADMIN' || role === 'MASTER_ADMIN' ? filteredAdminLinks : clientLinks;

  const clientProfileSubLinks =
    isClientProfileView && clientProfileId
      ? [
          {
            href: `/admin/clients/${clientProfileId}`,
            label: customBreadcrumb || 'Client Profile',
            icon: Users,
            isSub: false,
          },
          {
            href: `/admin/clients/${clientProfileId}/chemicals`,
            label: 'Substance Inventory',
            icon: Database,
            isSub: true,
          },
          {
            href: `/admin/clients/${clientProfileId}/certificates`,
            label: 'TCC Certificates',
            icon: Award,
            isSub: true,
          },
        ]
      : [];

  const dashboardHome = role === 'CLIENT' ? '/client' : '/admin';

  const navLinkClass = (active: boolean, isSub = false) =>
    `flex items-center gap-3 rounded-lg text-sm font-medium transition-all ${
      isSub ? 'pl-9 pr-4 py-2.5' : 'px-4 py-3'
    } ${
      active
        ? 'bg-accent text-accent-foreground shadow-xs'
        : 'text-primary-foreground/80 hover:text-white hover:bg-primary-hover'
    }`;

  const sidebarContent = (
    <div
      className="flex flex-col h-full bg-primary text-primary-foreground border-r border-primary/20"
      suppressHydrationWarning
    >
      <div
        className="flex items-center justify-between p-6 border-b border-primary-hover"
        suppressHydrationWarning
      >
        <div className="rounded-lg bg-white px-2.5 py-1.5 shadow-xs" suppressHydrationWarning>
          <BrandLogo variant="sidebar" href={dashboardHome} />
        </div>
        <button
          onClick={() => setSidebarOpen(false)}
          className="md:hidden p-1 rounded-md text-primary-foreground/75 hover:text-white hover:bg-primary-hover"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {role === 'CLIENT' && companyName && (
        <div className="px-6 py-4 bg-primary-hover/50 border-b border-primary-hover">
          <span className="text-[10px] uppercase text-primary-foreground/60 font-semibold tracking-wider block">
            Company Portal
          </span>
          <span className="text-sm font-semibold truncate block text-emerald-100">{companyName}</span>
        </div>
      )}

      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {isClientProfileView && clientProfileSubLinks.length > 0 ? (
          <>
            {clientProfileSubLinks.map((link) => {
              const Icon = link.icon;
              const isOverview = link.href === `/admin/clients/${clientProfileId}`;
              const isActive = isOverview
                ? pathname === link.href || pathname === `${link.href}/edit`
                : pathname === link.href || pathname.startsWith(`${link.href}/`);

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  prefetch
                  className={navLinkClass(isActive, link.isSub)}
                >
                  <Icon className={`shrink-0 ${link.isSub ? 'h-4 w-4' : 'h-5 w-5'}`} />
                  <span className="truncate" title={link.label}>
                    {link.label}
                  </span>
                </Link>
              );
            })}
            <div className="pt-3 mt-3 border-t border-primary-hover/60">
              <Link
                href="/admin/clients"
                prefetch
                className={navLinkClass(pathname === '/admin/clients', false)}
              >
                <Users className="h-5 w-5 shrink-0" />
                <span className="truncate">All Clients</span>
              </Link>
            </div>
          </>
        ) : (
          links.map((link) => {
            const isActive =
              pathname === link.href ||
              (link.href !== '/admin' &&
                link.href !== '/client' &&
                pathname.startsWith(link.href));
            const Icon = link.icon;

            return (
              <Link key={link.href} href={link.href} prefetch className={navLinkClass(isActive)}>
                <Icon className="h-5 w-5 shrink-0" />
                <span className="truncate" title={link.label}>
                  {link.label}
                </span>
              </Link>
            );
          })
        )}
      </nav>

      <div className="p-6 border-t border-primary-hover bg-primary-hover/30">
        <div className="text-[11px] text-primary-foreground/50 text-center font-medium">
          Pharmegic Healthcare v1.0.0
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden md:flex flex-col w-64 h-full shrink-0" suppressHydrationWarning>
        {sidebarContent}
      </aside>

      {isSidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden flex" suppressHydrationWarning>
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
            onClick={() => setSidebarOpen(false)}
            suppressHydrationWarning
          />
          <div
            className="relative flex flex-col w-64 max-w-xs h-full bg-primary z-50 animate-slide-in shadow-xl"
            suppressHydrationWarning
          >
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
