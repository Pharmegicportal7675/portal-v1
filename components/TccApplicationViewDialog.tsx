'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendCertificateEmailAction, resendCertificateEmailAction, getTccApplicationChangeHistoryAction } from '@/actions/tcc';
import { buildCertificateRecipients } from '@/lib/certificate-email-recipients';
import {
  appendMailSentHistory,
  parseMailSentHistory,
  resolveMailSentHistoryFallback,
} from '@/lib/certificate-mail-history';
import { CertificateMailHistoryList } from '@/components/CertificateMailHistoryList';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { formatDisplayDate } from '@/lib/date-filter';
import { getTccApplicationAvailableQuota, resolveTccApplicationCertificateYear, resolveTccApplicationRegistrationNumber, resolveTccApplicationTonnageBand } from '@/lib/tcc-application-quota';
import {
  resolveTccApplicationCertificateNumber,
} from '@/lib/tcc-application-certificate';
import {
  formatTccChangeLogAction,
  parseTccApplicationChangeLogMetadata,
  type TccApplicationChangeLogEntry,
} from '@/lib/tcc-application-changes';
import {
  Building,
  FileText,
  Paperclip,
  Shield,
  Download,
  ExternalLink,
  Mail,
  RefreshCw,
  CheckCircle2,
  Pencil,
  History,
} from 'lucide-react';
import {
  TccApplicationAdminEditForm,
  buildTccAdminEditValues,
} from '@/components/TccApplicationAdminEditForm';
import TccCertificateHtmlPreviewFromApi from '@/components/TccCertificateHtmlPreviewFromApi';
import {
  buildTccCertificatePdfDownloadUrl,
} from '@/lib/tcc-certificate-download';
import { CertificatePdfDownloadLink } from '@/components/CertificatePdfDownloadLink';
import { toast } from '@/store/toast';
import { isEuReachFramework } from '@/lib/regulatory-registrations';

export interface TccViewCertificate {
  id: string;
  certificate_number: string;
  file_url: string | null;
  issued_at: string;
  expires_at?: string | null;
  registration_number?: string | null;
  mail_sent?: boolean;
  mail_sent_at?: string | null;
  mail_resend_count?: number;
  last_resend_at?: string | null;
  mail_sent_history?: unknown;
}

export interface TccViewApplication {
  id: string;
  tracking_id?: string | null;
  quantity_mt: number;
  registration_number: string | null;
  export_date: string | null;
  remarks?: string | null;
  status: string;
  rejection_reason?: string | null;
  eu_importer_company_name?: string | null;
  eu_importer_address?: string | null;
  purchase_order_number?: string | null;
  invoice_number?: string | null;
  bo_attachment_url?: string | null;
  bo_attachment_name?: string | null;
  created_at: string;
  updated_at: string;
  certificate_issue_date?: string | null;
  certificate_valid_until_date?: string | null;
  rc_remaining_quota?: number | null;
  rc_period_certificate?: string | null;
  rc_tonnage_band?: string | null;
  rc_registration_number?: string | null;
  rc_certificate_year?: number | null;
  regulatory_framework?: string | null;
  client_chemicals?: { available_quantity: number; registration_number?: string | null } | null;
  clients: { company_name: string; email: string };
  chemicals: {
    chemical_name: string;
    cas_number: string;
    ec_number: string | null;
    tonnage_band: string | null;
    validity_date: string | null;
    available_quantity: number;
  };
  certificates?: TccViewCertificate | TccViewCertificate[] | null;
}

export type TccEmailDefaults = {
  defaultCcEmails?: string | null;
  senderEmail?: string | null;
  contactEmails?: string[];
};

function resolveCertificate(app: TccViewApplication): TccViewCertificate | null {
  const c = app.certificates;
  if (!c) return null;
  if (Array.isArray(c)) return c[0] ?? null;
  return c;
}

function resolveCertificateNumber(app: TccViewApplication): string | null {
  return resolveTccApplicationCertificateNumber(app);
}

function formatEmailList(emails: string[]): string {
  return emails.length > 0 ? emails.join(', ') : '—';
}

function DetailItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
      <div className="text-sm font-semibold text-slate-800 mt-0.5">{children}</div>
    </div>
  );
}

function isPdfUrl(url: string) {
  return /\.pdf($|\?)/i.test(url) || url.includes('application/pdf');
}

function isImageUrl(url: string) {
  return /\.(png|jpe?g|gif|webp)($|\?)/i.test(url);
}

function canReviewActions(status: string) {
  return status === 'pending' || status === 'changes_required' || status === 'modification_requested';
}

interface TccApplicationViewDialogProps {
  app: TccViewApplication | null;
  isOpen: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRequestChanges: () => void;
  getStatusBadge: (status: string) => React.ReactNode;
  allowReview?: boolean;
  allowAdminEdit?: boolean;
  onApplicationUpdated?: (updates: Partial<TccViewApplication>) => void;
  emailDefaults?: TccEmailDefaults;
}

export function TccApplicationViewDialog({
  app,
  isOpen,
  onClose,
  onApprove,
  onReject,
  onRequestChanges,
  getStatusBadge,
  allowReview = true,
  allowAdminEdit = false,
  onApplicationUpdated,
  emailDefaults,
}: TccApplicationViewDialogProps) {
  const router = useRouter();
  const [displayApp, setDisplayApp] = useState<TccViewApplication | null>(app);
  const [isEditing, setIsEditing] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [changeHistoryVersion, setChangeHistoryVersion] = useState(0);
  const [changeHistory, setChangeHistory] = useState<TccApplicationChangeLogEntry[]>([]);
  const [changeHistoryLoading, setChangeHistoryLoading] = useState(false);
  const [isSending, startSendTransition] = useTransition();
  const [isResending, startResendTransition] = useTransition();
  const [mailState, setMailState] = useState({
    mail_sent: false,
    mail_sent_at: null as string | null,
    mail_resend_count: 0,
    last_resend_at: null as string | null,
    mail_sent_history: [] as string[],
  });

  useEffect(() => {
    setDisplayApp(app);
    setIsEditing(false);
    setPreviewVersion(0);
    setChangeHistoryVersion(0);
  }, [app]);

  useEffect(() => {
    if (!isOpen || !displayApp?.id) {
      setChangeHistory([]);
      return;
    }

    let cancelled = false;
    setChangeHistoryLoading(true);

    void getTccApplicationChangeHistoryAction(displayApp.id).then((res) => {
      if (cancelled) return;
      if (!res.success || !res.entries) {
        setChangeHistory([]);
        setChangeHistoryLoading(false);
        return;
      }

      setChangeHistory(
        res.entries.map((entry: any) => {
          const userRow = entry.users as { email?: string } | { email?: string }[] | null;
          const adminEmail = Array.isArray(userRow) ? userRow[0]?.email : userRow?.email;
          return {
            id: entry.id,
            action: entry.action,
            description: entry.description,
            created_at: entry.created_at,
            adminEmail: adminEmail ?? null,
            changes: parseTccApplicationChangeLogMetadata(entry.metadata),
          };
        })
      );
      setChangeHistoryLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, displayApp?.id, changeHistoryVersion]);

  const cert = displayApp ? resolveCertificate(displayApp) : null;

  useEffect(() => {
    if (!cert) return;
    const history = parseMailSentHistory(cert.mail_sent_history);
    setMailState({
      mail_sent: cert.mail_sent ?? false,
      mail_sent_at: cert.mail_sent_at ?? null,
      mail_resend_count: cert.mail_resend_count ?? 0,
      last_resend_at: cert.last_resend_at ?? null,
      mail_sent_history:
        history.length > 0
          ? history
          : resolveMailSentHistoryFallback({
              mail_sent_at: cert.mail_sent_at,
              last_resend_at: cert.last_resend_at,
            }),
    });
  }, [
    cert?.id,
    cert?.mail_sent,
    cert?.mail_sent_at,
    cert?.mail_resend_count,
    cert?.last_resend_at,
    cert?.mail_sent_history,
  ]);

  const mailRecipients = useMemo(() => {
    if (!displayApp?.clients.email) return null;
    return buildCertificateRecipients({
      primaryEmail: displayApp.clients.email,
      contactEmails: emailDefaults?.contactEmails,
      defaultCcEmails: emailDefaults?.defaultCcEmails,
      senderEmail: emailDefaults?.senderEmail,
    });
  }, [displayApp?.clients.email, emailDefaults]);

  if (!displayApp) return null;

  const availableQuota = getTccApplicationAvailableQuota(displayApp);
  const showActions =
    allowReview && canReviewActions(displayApp.status) && !isEditing && isEuReachFramework(displayApp.regulatory_framework);
  const boUrl = displayApp.bo_attachment_url;
  const showDraftPreview = Boolean(displayApp.export_date || displayApp.id);
  const totalSent = mailState.mail_resend_count + (mailState.mail_sent ? 1 : 0);

  const handleSendMail = () => {
    if (!cert?.id) return;
    startSendTransition(async () => {
      const res = await sendCertificateEmailAction(cert.id);
      if (res.success) {
        const now = new Date().toISOString();
        setMailState({
          mail_sent: true,
          mail_sent_at: now,
          mail_resend_count: 0,
          last_resend_at: null,
          mail_sent_history: [now],
        });
        toast.success(res.message || 'Certificate email sent successfully.');
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to send email.');
      }
    });
  };

  const handleResendMail = () => {
    if (!cert?.id) return;
    startResendTransition(async () => {
      const res = await resendCertificateEmailAction(cert.id);
      if (res.success) {
        const now = new Date().toISOString();
        setMailState((prev) => ({
          ...prev,
          mail_resend_count: prev.mail_resend_count + 1,
          last_resend_at: now,
          mail_sent_history: appendMailSentHistory(prev.mail_sent_history, now),
        }));
        toast.success(res.message || 'Certificate email resent.');
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to resend email.');
      }
    });
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      size="wide"
      title={`Application Review — ${displayApp.tracking_id || displayApp.id.slice(0, 8).toUpperCase()}`}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {getStatusBadge(displayApp.status)}
            <span className="text-xs text-slate-500 font-medium">
              Submitted {formatDisplayDate(displayApp.created_at)}
            </span>
          </div>
          {allowAdminEdit && !isEditing && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setIsEditing(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          )}
        </div>

        {isEditing ? (
          <TccApplicationAdminEditForm
            values={buildTccAdminEditValues(displayApp)}
            onCancel={() => setIsEditing(false)}
            onSaved={(updates) => {
              const { certificateIssuedAt, certificateExpiresAt, ...appUpdates } = updates;
              setDisplayApp((prev) => {
                if (!prev) return prev;
                let next = { ...prev, ...appUpdates };
                if (certificateIssuedAt || certificateExpiresAt) {
                  const existingCert = resolveCertificate(prev);
                  if (existingCert) {
                    next = {
                      ...next,
                      certificates: {
                        ...existingCert,
                        ...(certificateIssuedAt ? { issued_at: certificateIssuedAt } : {}),
                        ...(certificateExpiresAt ? { expires_at: certificateExpiresAt } : {}),
                      },
                    };
                  }
                }
                return next;
              });
              setIsEditing(false);
              setPreviewVersion((v) => v + 1);
              setChangeHistoryVersion((v) => v + 1);
              onApplicationUpdated?.(appUpdates);
              router.refresh();
            }}
          />
        ) : (
          <>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Client submission */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
              <Building className="h-4 w-4 text-primary" />
              Client submission
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50/80 rounded-xl border border-slate-100 p-4">
              <DetailItem label="Company">{displayApp.clients.company_name}</DetailItem>
              <DetailItem label="Contact email">{displayApp.clients.email}</DetailItem>
              <DetailItem label="Substance">{displayApp.chemicals.chemical_name}</DetailItem>
              <DetailItem label="CAS number">
                <span className="font-mono text-xs">{displayApp.chemicals.cas_number}</span>
              </DetailItem>
              {displayApp.chemicals.ec_number && (
                <DetailItem label="EC number">
                  <span className="font-mono text-xs">{displayApp.chemicals.ec_number}</span>
                </DetailItem>
              )}
              <DetailItem label="Tonnage band">
                {resolveTccApplicationTonnageBand(displayApp) || '—'}
              </DetailItem>
              <DetailItem label="Certificate year">
                {resolveTccApplicationCertificateYear(displayApp) ?? '—'}
              </DetailItem>
              <DetailItem label="Certificate no.">
                <span className="font-mono text-xs text-emerald-700">
                  {resolveCertificateNumber(displayApp) || '—'}
                </span>
              </DetailItem>
              <DetailItem label="Invoice No.">
                {displayApp.invoice_number?.trim() || '—'}
              </DetailItem>
              <DetailItem label="Quantity requested">
                <span className="text-lg font-black text-teal-800">{displayApp.quantity_mt} MT</span>
              </DetailItem>
              <DetailItem label="Available quota (client)">
                {availableQuota} MT
              </DetailItem>
              <DetailItem label="Registration number">
                <span className="font-mono text-xs">
                  {resolveTccApplicationRegistrationNumber(displayApp) || '—'}
                </span>
              </DetailItem>
              <DetailItem label="PO Date">
                {formatDisplayDate(displayApp.export_date)}
              </DetailItem>
              {displayApp.remarks && (
                <div className="col-span-2">
                  <DetailItem label="Remarks / notes">{displayApp.remarks}</DetailItem>
                </div>
              )}
            </div>

            {(changeHistoryLoading || changeHistory.length > 0) && (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="text-xs font-bold text-slate-700 flex items-center gap-2 mb-3">
                  <History className="h-3.5 w-3.5 text-slate-500" />
                  Change history
                </h4>
                {changeHistoryLoading ? (
                  <p className="text-xs text-slate-400 font-medium">Loading changes…</p>
                ) : (
                  <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                    {changeHistory.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2.5"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-xs font-bold text-slate-800">
                            {formatTccChangeLogAction(entry.action)}
                          </p>
                          <p className="text-[10px] text-slate-400 font-medium" suppressHydrationWarning>
                            {formatDisplayDate(entry.created_at)}
                          </p>
                        </div>
                        {entry.adminEmail && (
                          <p className="text-[10px] text-slate-500 mt-0.5">{entry.adminEmail}</p>
                        )}
                        {entry.changes.length > 0 ? (
                          <ul className="mt-2 space-y-1">
                            {entry.changes.map((change) => (
                              <li key={`${entry.id}-${change.field}`} className="text-xs text-slate-600">
                                <span className="font-semibold text-slate-700">{change.label}:</span>{' '}
                                <span className="text-slate-500">{change.from}</span>
                                <span className="mx-1 text-slate-400">→</span>
                                <span className="font-semibold text-teal-800">{change.to}</span>
                              </li>
                            ))}
                          </ul>
                        ) : entry.description ? (
                          <p className="text-xs text-slate-500 mt-1">{entry.description}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="rounded-xl border border-teal-100 bg-teal-50/40 p-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
                <Building className="h-4 w-4 text-teal-700" />
                EU Importer Information
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailItem label="Company name">{displayApp.eu_importer_company_name || '—'}</DetailItem>
                <DetailItem label="Address">{displayApp.eu_importer_address || '—'}</DetailItem>
                <DetailItem label="Purchase order number">{displayApp.purchase_order_number || '—'}</DetailItem>
              </div>
            </div>

            {/* PO attachment */}
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                  <Paperclip className="h-3.5 w-3.5" />
                  PO attachment (client upload)
                </span>
                {boUrl && (
                  <a
                    href={boUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1"
                  >
                    Open <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              {boUrl ? (
                <div className="p-2 bg-white min-h-[200px]">
                  {isImageUrl(boUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={boUrl}
                      alt={displayApp.bo_attachment_name || 'PO attachment'}
                      className="max-h-[280px] w-full object-contain rounded"
                    />
                  ) : isPdfUrl(boUrl) ? (
                    <iframe
                      src={boUrl}
                      title="PO attachment preview"
                      className="w-full h-[280px] rounded border border-slate-100"
                    />
                  ) : (
                    <div className="p-6 text-center text-sm text-slate-500">
                      <FileText className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                      <p className="font-medium">{displayApp.bo_attachment_name || 'Attachment file'}</p>
                      <a
                        href={boUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary font-bold text-xs mt-2 inline-block hover:underline"
                      >
                        Download / open file
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <p className="p-6 text-sm text-slate-400 text-center font-medium">No PO attachment uploaded</p>
              )}
            </div>
          </div>

          {/* Certificate preview */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
              <Shield className="h-4 w-4 text-primary" />
              Certificate preview
            </h3>
            {cert?.id ? (
              <div className="rounded-xl border border-emerald-100 overflow-hidden bg-emerald-50/30">
                <div className="px-4 py-2.5 border-b border-emerald-100 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <Badge variant="success" className="text-[10px]">
                      {cert.certificate_number}
                    </Badge>
                    <p className="text-[10px] text-slate-500 mt-1 font-medium">
                      Issued {formatDisplayDate(cert.issued_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <CertificatePdfDownloadLink
                      pdfUrl={buildTccCertificatePdfDownloadUrl(cert.id)}
                      docxUrl=""
                      fileName={`${cert.certificate_number}.pdf`}
                      certificateType="tcc"
                      className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline disabled:opacity-60"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download PDF
                    </CertificatePdfDownloadLink>
                    {!mailState.mail_sent ? (
                      <Button
                        onClick={handleSendMail}
                        isLoading={isSending}
                        disabled={isSending}
                        size="sm"
                        className="gap-1.5 h-8"
                      >
                        <Mail className="h-3.5 w-3.5" /> Send Mail To Client
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-[10px] font-bold text-emerald-700">
                            Sent {totalSent > 1 ? `(${totalSent}x)` : ''}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          onClick={handleResendMail}
                          isLoading={isResending}
                          disabled={isResending}
                          size="sm"
                          className="gap-1.5 h-8"
                        >
                          <RefreshCw className="h-3.5 w-3.5" /> Resend Mail
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {mailState.mail_sent && mailRecipients && (
                  <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 text-xs font-medium text-blue-700 space-y-1">
                    <p>
                      <strong>TO:</strong> {mailRecipients.to}
                    </p>
                    <p>
                      <strong>CC:</strong> {formatEmailList(mailRecipients.cc)}
                    </p>
                    <CertificateMailHistoryList timestamps={mailState.mail_sent_history} />
                  </div>
                )}

                <TccCertificateHtmlPreviewFromApi
                  key={previewVersion}
                  certificateId={cert.id}
                  cacheBust={previewVersion}
                />
              </div>
            ) : showDraftPreview ? (
              <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50/50">
                <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <Badge variant="outline" className="text-[10px]">
                      Draft preview
                    </Badge>
                    <p className="text-[10px] text-slate-500 mt-1 font-medium">
                      Based on current submission data. The final certificate is generated when you approve.
                    </p>
                  </div>
                </div>
                <TccCertificateHtmlPreviewFromApi
                  key={previewVersion}
                  applicationId={displayApp.id}
                  cacheBust={previewVersion}
                />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                <FileText className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-600">Certificate preview unavailable</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                  Add a PO date to generate a draft certificate preview.
                </p>
              </div>
            )}

            {displayApp.rejection_reason && displayApp.status !== 'approved' && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-900 font-medium">
                <span className="font-bold block mb-1">Previous feedback</span>
                {displayApp.rejection_reason}
              </div>
            )}
          </div>
        </div>
          </>
        )}

        {/* Review actions */}
        {showActions && (
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <p className="text-xs text-slate-500 font-medium">
              Review all submitted data and attachments, then choose an action:
            </p>
            <div className="flex flex-wrap justify-end gap-3">
              <Button type="button" variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onRequestChanges}
                className="text-amber-700 border-amber-200 hover:bg-amber-50"
              >
                Request changes
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onReject}
                className="text-rose-600 border-rose-200 hover:bg-rose-50"
              >
                Reject
              </Button>
              <Button
                type="button"
                onClick={onApprove}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Approve &amp; issue certificate
              </Button>
            </div>
          </div>
        )}

        {!showActions && (
          <div className="flex justify-end pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
