'use client';

import { useEffect, useRef, useState } from 'react';
import {
  LogIn,
  LayoutDashboard,
  FileSignature,
  Award,
  ShieldCheck,
  Bell,
  Monitor,
  Lock,
  HelpCircle,
  Phone,
  ChevronRight,
  Menu,
  X,
  ZoomIn,
  Mail,
  MapPin,
  Wrench,
} from 'lucide-react';

type Section = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  intro: string;
  steps: string[];
  image: string;
  imageAlt: string;
  note?: string;
};

const SECTIONS: Section[] = [
  {
    id: 'getting-started',
    label: 'Getting Started',
    icon: LogIn,
    title: '1. Getting Started — Signing In',
    intro:
      'The Pharmegic Healthcare Limited portal is accessed with the corporate email and password issued by your account administrator. No separate app installation is required — the portal works in any modern web browser, on desktop, tablet, or mobile.',
    steps: [
      'Open the portal login page in your browser.',
      'Enter your Corporate Email and Password in the fields provided.',
      'Click "Authenticate Session" to sign in.',
      'If you forget your credentials, contact your Pharmegic Healthcare Limited account administrator to have them reset — there is no self-service password reset.',
    ],
    image: '/user-manual-assets/login.png',
    imageAlt: 'Portal login screen',
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    title: '2. Dashboard Overview',
    intro:
      'After signing in, you land on your company Dashboard — a single-page summary of your compliance status. It shows your active substance permissions, monthly TCC (Tonnage Compliance Certificate) activity, your year-wise CT Compliance Certificates, and every TCC application you have submitted.',
    steps: [
      '"Active Permissions" shows how many substances your organization is currently authorized to trade, and any renewals pending.',
      '"Monthly TCC Activity" charts approved export volumes per substance for the selected year.',
      'The "CT Compliance Certificates" table lists every substance certificate by year, with its validity period, status (Active / Expired), tonnage band, and remaining quota. Use the download icon in the Actions column to save a certificate.',
      '"My TCC Applications & Certificates" tracks every export declaration you have submitted, with its status: Pending, Under Review, Approved, or Rejected.',
      'An application can still be edited or withdrawn as long as it has not yet been Approved — once approved, it is locked and a certificate is issued against it.',
    ],
    image: '/user-manual-assets/dashboard.png',
    imageAlt: 'Client dashboard with active permissions, TCC activity chart, certificates table, and application tracker',
  },
  {
    id: 'apply-tcc',
    label: 'Apply for TCC',
    icon: FileSignature,
    title: '3. Applying for a Tonnage Compliance Certificate (TCC)',
    intro:
      'The "Apply for TCC" page is where you submit a new export declaration against your available quota. The form validates your request in real time against your CT Compliance Certificate before it reaches an administrator for approval.',
    steps: [
      'Choose the Regulatory Framework for this application (EU REACH runs the full quota and certificate workflow; UK REACH / Turkey KKDIK are notification-only).',
      'Fill in the EU Importer Information: company name, address, purchase order number, and invoice number (optional).',
      'Select the authorized Substance from the dropdown — only substances with an active CT Compliance Certificate can be selected for EU REACH.',
      'Pick the PO Date using the calendar control. The matching CT certificate period and validity are shown automatically.',
      'Enter the Export Tonnage. The "Quota Simulation" panel on the right updates live, showing current available quota, the requested amount, and the projected remaining balance.',
      'Attach the required PO document, then click "Submit Application" to send it for admin approval.',
    ],
    image: '/user-manual-assets/apply.png',
    imageAlt: 'Apply for TCC form with a substance selected and the quota simulation panel populated',
    note: 'A request that exceeds the available quota for the selected certificate period is blocked automatically, with the shortfall shown on screen.',
  },
  {
    id: 'certificates',
    label: 'My Certificates',
    icon: Award,
    title: '4. My Certificates',
    intro:
      'Every REACH / TCC certificate issued to your organization is available for search and download from "My Certificates" — no need to request copies from support.',
    steps: [
      'Use the search bar to find a certificate by certificate number, substance name, or CAS number.',
      'Filter the list using the dropdown (e.g. "All Certificates" or a specific certificate type).',
      'Each row shows the certificate type, number, substance, authorized weight, issuance date, validity/expiry, and status (Valid / Expired).',
      'Click "PDF" to download a certificate, or the external-link icon to open its verification page in a new tab.',
    ],
    image: '/user-manual-assets/certificates.png',
    imageAlt: 'My Certificates list with search, filter, and download actions',
  },
  {
    id: 'verification',
    label: 'Certificate Verification',
    icon: ShieldCheck,
    title: '5. Certificate Verification',
    intro:
      'Every certificate carries a QR code and a printed certificate number so that a customs officer, auditor, or business partner can verify its authenticity instantly — without needing a portal login.',
    steps: [
      'Scan the QR code printed on the certificate, or open the verification link and enter the certificate number manually.',
      'The verification page shows whether the certificate is Valid, Expired, or Revoked.',
      'It also displays the certificate holder, substance details, and validity period, confirming the certificate matches official records.',
    ],
    image: '/user-manual-assets/verify.png',
    imageAlt: 'Public certificate verification page showing a valid REACH certificate',
    note: 'Verification pages are public — anyone with the certificate number or QR code can confirm authenticity, without signing in.',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: Bell,
    title: '6. Notifications',
    intro:
      'The bell icon in the top bar keeps you updated on certificate issuance, approvals, and other account activity, so you don’t have to check the dashboard for changes.',
    steps: [
      'A red badge on the bell shows how many notifications are unread.',
      'Click the bell to open the notification list, newest first.',
      'Click a notification to jump straight to the relevant certificate or application.',
      'Use "Mark all read" to clear the unread badge.',
    ],
    image: '/user-manual-assets/notifications.png',
    imageAlt: 'Notification dropdown showing certificate issuance alerts',
  },
];

const REQUIREMENTS = [
  { label: 'Recommended Browsers', value: 'Google Chrome, Microsoft Edge, or Mozilla Firefox (latest version)' },
  { label: 'Internet Connection', value: 'A stable broadband or mobile connection (minimum ~5 Mbps recommended)' },
  { label: 'Supported Devices', value: 'Desktop and laptop (recommended); tablet and mobile are also supported' },
];

const FAQS = [
  {
    q: 'I forgot my password. What do I do?',
    a: 'There is no self-service reset. Contact your Pharmegic Healthcare Limited account administrator and they will issue a new password.',
  },
  {
    q: 'Can I change my login email myself?',
    a: 'No. Login credentials are managed by your Pharmegic Healthcare Limited administrator — contact them to update your registered email.',
  },
  {
    q: 'Can I edit a TCC application after submitting it?',
    a: 'Yes, as long as it has not yet been Approved. Open it from "My TCC Applications & Certificates" on your dashboard to edit or withdraw it. Once approved, it is locked and a certificate is issued.',
  },
  {
    q: 'How do I confirm a certificate is genuine?',
    a: 'Scan the QR code on the certificate, or open its verification link and check that the status reads "Valid & Active".',
  },
  {
    q: "I didn't receive a certificate email.",
    a: 'Check your spam/junk folder first. If it still isn’t there, contact Pharmegic Healthcare Limited support and the notification can be resent.',
  },
];

const TROUBLESHOOTING = [
  { problem: 'Cannot log in', solution: 'Double-check your email and password. If it still fails, contact your administrator to confirm your account is active.' },
  { problem: 'A certificate isn’t showing yet', solution: 'Certificates appear once an administrator approves the related TCC application — check its status on your dashboard.' },
  { problem: 'Notification email not received', solution: 'Check your spam folder, then contact support so it can be resent.' },
  { problem: 'Application stuck on "Pending" / "Under Review"', solution: 'This is normal while an administrator reviews it. No action is needed on your end until the status changes.' },
];

function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: '-15% 0px -70% 0px', threshold: 0 }
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [ids]);

  return active;
}

const NAV_ITEMS = [
  ...SECTIONS.map((s) => ({ id: s.id, label: s.label, icon: s.icon })),
  { id: 'requirements', label: 'System Requirements', icon: Monitor },
  { id: 'security', label: 'Password & Security', icon: Lock },
  { id: 'faq', label: 'FAQ', icon: HelpCircle },
  { id: 'troubleshooting', label: 'Troubleshooting', icon: Wrench },
  { id: 'support', label: 'Support', icon: Phone },
];

function NavList({ active, onNavigate }: { active: string; onNavigate?: () => void }) {
  return (
    <ul className="space-y-1">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.id;
        return (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              onClick={onNavigate}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export default function UserManualContent() {
  const ids = NAV_ITEMS.map((s) => s.id);
  const active = useActiveSection(ids);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!lightbox) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [lightbox]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Mobile nav toggle */}
      <div className="sticky top-0 z-30 -mx-4 mb-4 flex items-center justify-between border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 lg:hidden">
        <span className="text-sm font-bold text-slate-800">On this page</span>
        <button
          type="button"
          onClick={() => setMobileNavOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
        >
          {mobileNavOpen ? <X className="h-3.5 w-3.5" /> : <Menu className="h-3.5 w-3.5" />}
          Contents
        </button>
      </div>
      {mobileNavOpen && (
        <div className="sticky top-[52px] z-30 -mx-4 -mt-4 mb-4 max-h-[70vh] overflow-y-auto border-b border-slate-100 bg-white p-4 shadow-lg sm:-mx-6 lg:hidden">
          <NavList active={active} onNavigate={() => setMobileNavOpen(false)} />
        </div>
      )}

      <div className="flex gap-8">
        {/* Sidebar TOC (desktop) */}
        <aside className="hidden shrink-0 basis-56 lg:block">
          <div className="sticky top-8 max-h-[calc(100vh-4rem)] overflow-y-auto rounded-xl border border-slate-100 bg-white p-3 shadow-xs">
            <p className="px-3 pb-2 pt-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
              On this page
            </p>
            <NavList active={active} />
          </div>
        </aside>

        {/* Content */}
        <div className="min-w-0 flex-1 space-y-14">
          {SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <div className="flex items-center gap-2 text-primary">
                <section.icon className="h-5 w-5" />
                <h2 className="text-xl font-bold tracking-tight text-slate-800">{section.title}</h2>
              </div>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">{section.intro}</p>

              <ol className="mt-4 max-w-3xl list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-700 marker:font-bold marker:text-primary">
                {section.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>

              {section.note && (
                <p className="mt-4 max-w-3xl rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">
                  {section.note}
                </p>
              )}

              <button
                type="button"
                onClick={() => setLightbox({ src: section.image, alt: section.imageAlt })}
                className="group relative mt-5 block w-full max-w-3xl overflow-hidden rounded-xl border border-slate-200 shadow-sm"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={section.image} alt={section.imageAlt} className="w-full" loading="lazy" />
                <span className="absolute inset-0 flex items-center justify-center bg-slate-900/0 transition-colors group-hover:bg-slate-900/30">
                  <span className="flex items-center gap-1.5 rounded-full bg-white/0 px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow transition-opacity group-hover:bg-white/90 group-hover:text-slate-800 group-hover:opacity-100">
                    <ZoomIn className="h-3.5 w-3.5" /> Click to enlarge
                  </span>
                </span>
              </button>
            </section>
          ))}

          <section id="requirements" className="scroll-mt-24">
            <div className="flex items-center gap-2 text-primary">
              <Monitor className="h-5 w-5" />
              <h2 className="text-xl font-bold tracking-tight text-slate-800">7. System Requirements</h2>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">
              The portal is a web application — nothing to install. Any reasonably modern setup works.
            </p>
            <div className="mt-4 max-w-3xl overflow-hidden rounded-xl border border-slate-200">
              {REQUIREMENTS.map((r, i) => (
                <div
                  key={r.label}
                  className={`grid grid-cols-1 gap-1 p-4 text-sm sm:grid-cols-3 sm:gap-4 ${
                    i !== REQUIREMENTS.length - 1 ? 'border-b border-slate-100' : ''
                  } ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}
                >
                  <span className="font-bold text-slate-800 sm:col-span-1">{r.label}</span>
                  <span className="text-slate-600 sm:col-span-2">{r.value}</span>
                </div>
              ))}
            </div>
          </section>

          <section id="security" className="scroll-mt-24">
            <div className="flex items-center gap-2 text-primary">
              <Lock className="h-5 w-5" />
              <h2 className="text-xl font-bold tracking-tight text-slate-800">8. Password &amp; Security</h2>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">
              Your account has access to your organization&apos;s compliance certificates and export
              declarations — a few habits keep it secure:
            </p>
            <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-700 marker:text-primary">
              <li>Never share your password with anyone, including colleagues.</li>
              <li>Always click &quot;Log Out&quot; when you&apos;re done, especially on a shared computer.</li>
              <li>Don&apos;t save your password in a browser on a public or shared computer.</li>
              <li>Report anything suspicious (unexpected certificates, applications you didn&apos;t submit) to Pharmegic Healthcare Limited immediately.</li>
            </ul>
          </section>

          <section id="faq" className="scroll-mt-24">
            <div className="flex items-center gap-2 text-primary">
              <HelpCircle className="h-5 w-5" />
              <h2 className="text-xl font-bold tracking-tight text-slate-800">9. Frequently Asked Questions</h2>
            </div>
            <div className="mt-4 max-w-3xl space-y-4">
              {FAQS.map((item) => (
                <div key={item.q} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                  <p className="text-sm font-bold text-slate-800">{item.q}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{item.a}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="troubleshooting" className="scroll-mt-24">
            <div className="flex items-center gap-2 text-primary">
              <Wrench className="h-5 w-5" />
              <h2 className="text-xl font-bold tracking-tight text-slate-800">10. Troubleshooting</h2>
            </div>
            <div className="mt-4 max-w-3xl overflow-hidden rounded-xl border border-slate-200">
              {TROUBLESHOOTING.map((row, i) => (
                <div
                  key={row.problem}
                  className={`grid grid-cols-1 gap-1 p-4 text-sm sm:grid-cols-3 sm:gap-4 ${
                    i !== TROUBLESHOOTING.length - 1 ? 'border-b border-slate-100' : ''
                  } ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}
                >
                  <span className="font-bold text-slate-800 sm:col-span-1">{row.problem}</span>
                  <span className="text-slate-600 sm:col-span-2">{row.solution}</span>
                </div>
              ))}
            </div>
          </section>

          <section id="support" className="scroll-mt-24">
            <div className="flex items-center gap-2 text-primary">
              <Phone className="h-5 w-5" />
              <h2 className="text-xl font-bold tracking-tight text-slate-800">11. Support &amp; Contact Information</h2>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">
              If you run into an issue not covered here — a missing certificate, a quota discrepancy,
              or trouble signing in — reach out to Pharmegic Healthcare Limited directly.
            </p>
            <div className="mt-4 max-w-3xl space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
              <p className="text-sm font-bold text-slate-800">Pharmegic Healthcare Limited</p>
              <div className="flex items-start gap-2.5 text-sm text-slate-600">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>B-74, Pariseema Complex, Near Lal Bungalow Cross Roads, C.G. Road, Ahmedabad – 380006</span>
              </div>
              <div className="flex items-center gap-2.5 text-sm text-slate-600">
                <Mail className="h-4 w-4 shrink-0 text-primary" />
                <a href="mailto:js@pharmegichealthcare.com" className="hover:text-primary hover:underline">
                  js@pharmegichealthcare.com
                </a>
              </div>
              <div className="flex items-center gap-2.5 text-sm text-slate-600">
                <Phone className="h-4 w-4 shrink-0 text-primary" />
                <a href="tel:+919998084646" className="hover:text-primary hover:underline">
                  +91 99980 84646
                </a>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-400">
              <ChevronRight className="h-3.5 w-3.5" />
              <span>This manual reflects the portal as it stands today and may evolve as features are added.</span>
            </div>
          </section>
        </div>
      </div>

      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 sm:p-8"
          onClick={() => setLightbox(null)}
        >
          <div ref={dialogRef} className="relative max-h-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setLightbox(null)}
              aria-label="Close"
              className="absolute -top-10 right-0 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
            >
              <X className="h-3.5 w-3.5" /> Close
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.src}
              alt={lightbox.alt}
              className="max-h-[85vh] w-auto rounded-lg border border-white/10 shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
