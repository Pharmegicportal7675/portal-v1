'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendCertificateEmailAction, resendCertificateEmailAction } from '@/actions/tcc';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { toast } from '@/store/toast';
import {
  Download,
  ArrowLeft,
  Mail,
  RefreshCw,
  CheckCircle2,
  Building,
  FlaskConical,
  Calendar,
  FileText,
  Shield,
  AlertCircle,
  Pencil,
} from 'lucide-react';
import Link from 'next/link';
import ReachCertificateViewer from '@/components/ReachCertificateViewer';
import TccCertificateHtmlPreviewFromApi from '@/components/TccCertificateHtmlPreviewFromApi';
import {
  buildReachCertificateDocxPreviewUrl,
  buildReachCertificatePdfDownloadUrl,
} from '@/lib/reach-certificate-download';
import {
  buildTccCertificatePdfDownloadUrl,
} from '@/lib/tcc-certificate-download';
import { formatDisplayDate } from '@/lib/date-filter';
import { CertificatePdfDownloadLink } from '@/components/CertificatePdfDownloadLink';
import { CertificateMailHistoryList } from '@/components/CertificateMailHistoryList';
import {
  TccApplicationAdminEditForm,
  buildTccAdminEditValues,
} from '@/components/TccApplicationAdminEditForm';
import { getTccCertificateValidUntilDate } from '@/lib/tcc-certificate-dates';
import type { TccViewApplication } from '@/components/TccApplicationViewDialog';

type TccApplicationPreview = {
  id: string;
  quantity_mt: number;
  registration_number: string | null;
  export_date: string | null;
  remarks?: string | null;
  status?: string;
  eu_importer_company_name?: string | null;
  eu_importer_address?: string | null;
  purchase_order_number?: string | null;
  invoice_number?: string | null;
  tracking_id?: string | null;
  created_at?: string;
  updated_at?: string;
  chemicals: {
    chemical_name: string;
    cas_number: string;
    ec_number: string | null;
    tonnage_band: string | null;
  };
};

interface CertificatePreviewClientProps {
  cert: {
    id: string;
    client_id?: string | null;
    certificate_number: string;
    type?: string | null;
    file_url: string;
    issued_at: string;
    expires_at: string;
    status: string;
    registration_number?: string | null;
    tonnage_band?: string | null;
    mail_sent: boolean;
    mail_sent_at: string | null;
    mail_resend_count: number;
    last_resend_at: string | null;
    clients: {
      company_name: string;
      legal_name: string | null;
      email: string;
      registration_number: string | null;
      address?: string | null;
      city?: string | null;
      state?: string | null;
      postal_code?: string | null;
      country?: string | null;
      uuid_number?: string | null;
    };
    chemicals?: {
      chemical_name: string;
      cas_number: string;
      ec_number: string | null;
      tonnage_band: string | null;
    } | null;
    tcc_applications?: TccApplicationPreview | null;
  };
  mailSentHistory?: string[];
}

function buildViewApplicationFromCert(
  cert: CertificatePreviewClientProps['cert'],
  tccApp: TccApplicationPreview
): TccViewApplication {
  const chemical = cert.chemicals || tccApp.chemicals;
  return {
    id: tccApp.id,
    tracking_id: tccApp.tracking_id,
    quantity_mt: tccApp.quantity_mt,
    registration_number: tccApp.registration_number || '',
    export_date: tccApp.export_date,
    remarks: tccApp.remarks,
    status: tccApp.status || 'approved',
    eu_importer_company_name: tccApp.eu_importer_company_name,
    eu_importer_address: tccApp.eu_importer_address,
    purchase_order_number: tccApp.purchase_order_number,
    invoice_number: tccApp.invoice_number,
    created_at: tccApp.created_at || cert.issued_at,
    updated_at: tccApp.updated_at || cert.issued_at,
    clients: {
      company_name: cert.clients.company_name,
      email: cert.clients.email,
    },
    chemicals: {
      chemical_name: chemical?.chemical_name || 'N/A',
      cas_number: chemical?.cas_number || 'N/A',
      ec_number: chemical?.ec_number ?? null,
      tonnage_band: chemical?.tonnage_band ?? null,
      validity_date: null,
      available_quantity: 0,
    },
    certificates: {
      id: cert.id,
      certificate_number: cert.certificate_number,
      file_url: cert.file_url,
      issued_at: cert.issued_at,
    },
  };
}

export default function CertificatePreviewClient({
  cert,
  mailSentHistory = [],
}: CertificatePreviewClientProps) {
  const router = useRouter();
  const [isSending, startSendTransition] = useTransition();
  const [isResending, startResendTransition] = useTransition();
  const [tccApp, setTccApp] = useState(cert.tcc_applications ?? null);
  const [issuedAt, setIssuedAt] = useState(cert.issued_at);
  const [expiresAt, setExpiresAt] = useState(cert.expires_at);
  const [isEditing, setIsEditing] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);

  const isReach = cert.type === 'REACH';
  const chemical = cert.chemicals || tccApp?.chemicals;
  const backHref =
    isReach && cert.client_id
      ? `/admin/clients/${cert.client_id}`
      : '/admin/approvals';

  const totalSent = cert.mail_resend_count + (cert.mail_sent ? 1 : 0);
  const docxPreviewUrl = isReach
    ? `${buildReachCertificateDocxPreviewUrl(cert.id)}&v=${previewVersion}`
    : '';
  const viewApplication = useMemo(() => {
    if (!tccApp) return null;
    return buildViewApplicationFromCert(
      { ...cert, issued_at: issuedAt, expires_at: expiresAt },
      tccApp
    );
  }, [cert, tccApp, issuedAt, expiresAt]);

  const handleSendMail = () => {
    startSendTransition(async () => {
      const res = await sendCertificateEmailAction(cert.id);
      if (res.success) {
        toast.success(res.message || 'Certificate email sent successfully.');
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to send email.');
      }
    });
  };

  const handleResendMail = () => {
    startResendTransition(async () => {
      const res = await resendCertificateEmailAction(cert.id);
      if (res.success) {
        toast.success(res.message || 'Certificate email resent.');
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to resend email.');
      }
    });
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href={backHref}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
              {isReach ? 'REACH Certificate Preview' : 'Certificate Preview'}
              <span className="font-mono text-primary text-base">{cert.certificate_number}</span>
            </h1>
            <p className="text-sm text-slate-500 font-medium">
              {isReach
                ? 'REACH Compliance Certificate — valid for 1 year. Required before TCC application.'
                : 'TCC Import Certificate — review, edit application data, and send to the client'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <CertificatePdfDownloadLink
            pdfUrl={
              isReach
                ? buildReachCertificatePdfDownloadUrl(cert.id)
                : buildTccCertificatePdfDownloadUrl(cert.id)
            }
            docxUrl={
              isReach
                ? buildReachCertificateDocxPreviewUrl(cert.id)
                : ''
            }
            fileName={`${cert.certificate_number}.pdf`}
            certificateType={isReach ? 'rc' : 'tcc'}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 transition-colors disabled:opacity-60"
          >
            <Download className="h-4 w-4" /> Download PDF
          </CertificatePdfDownloadLink>

          {!isReach && viewApplication && !isEditing && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setIsEditing(true)}>
              <Pencil className="h-4 w-4" /> Edit application data
            </Button>
          )}

          {!isReach &&
            (!cert.mail_sent ? (
              <Button onClick={handleSendMail} isLoading={isSending} disabled={isSending} className="gap-1.5">
                <Mail className="h-4 w-4" /> Send Mail To Client
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs font-bold text-emerald-700">
                    Sent {totalSent > 1 ? `(${totalSent}x)` : ''}
                  </span>
                </div>
                <Button
                  variant="outline"
                  onClick={handleResendMail}
                  isLoading={isResending}
                  disabled={isResending}
                  size="sm"
                  className="gap-1.5"
                >
                  <RefreshCw className="h-4 w-4" /> Resend Mail
                </Button>
              </div>
            ))}
        </div>
      </div>

      {cert.mail_sent && !isReach && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
          <div className="text-xs font-medium text-blue-700 space-y-0.5 w-full">
            <CertificateMailHistoryList timestamps={mailSentHistory} />
          </div>
        </div>
      )}

      {!isReach && isEditing && viewApplication && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <TccApplicationAdminEditForm
            values={buildTccAdminEditValues(viewApplication)}
            onCancel={() => setIsEditing(false)}
            onSaved={(updates) => {
              const { certificateIssuedAt, ...appUpdates } = updates;
              setTccApp((prev) => (prev ? { ...prev, ...appUpdates } : prev));
              if (certificateIssuedAt) {
                setIssuedAt(certificateIssuedAt);
                const exportDate =
                  appUpdates.export_date ?? viewApplication.export_date ?? null;
                setExpiresAt(
                  getTccCertificateValidUntilDate(
                    exportDate ? String(exportDate).split('T')[0] : null,
                    certificateIssuedAt.split('T')[0]
                  ).toISOString()
                );
              } else if (appUpdates.export_date) {
                setExpiresAt(
                  getTccCertificateValidUntilDate(
                    String(appUpdates.export_date).split('T')[0],
                    issuedAt?.split('T')[0] ?? null
                  ).toISOString()
                );
              }
              setIsEditing(false);
              setPreviewVersion((v) => v + 1);
              router.refresh();
            }}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <Building className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-slate-800">Client Information</h3>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-0.5">Company</p>
                <p className="font-semibold text-slate-800">{cert.clients.company_name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-0.5">Email</p>
                <p className="font-medium text-slate-600">{cert.clients.email}</p>
              </div>
            </div>
          </div>

          {chemical && (
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <FlaskConical className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold text-slate-800">
                  {isReach ? 'REACH Substance Details' : 'Substance & Application'}
                </h3>
              </div>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-0.5">Substance</p>
                  <p className="font-semibold text-slate-800">{chemical.chemical_name}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-0.5">CAS Number</p>
                    <p className="font-mono font-semibold text-slate-700">{chemical.cas_number}</p>
                  </div>
                  {chemical.ec_number && (
                    <div>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-0.5">EC Number</p>
                      <p className="font-mono font-semibold text-slate-700">{chemical.ec_number}</p>
                    </div>
                  )}
                </div>
                {!isReach && tccApp && (
                  <>
                    <div>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-0.5">EU importer</p>
                      <p className="font-semibold text-slate-800">{tccApp.eu_importer_company_name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-0.5">Quantity</p>
                      <p className="text-lg font-black text-slate-800">{tccApp.quantity_mt} MT</p>
                    </div>
                    {tccApp.purchase_order_number && (
                      <div>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-0.5">PO number</p>
                        <p className="font-semibold text-slate-700">{tccApp.purchase_order_number}</p>
                      </div>
                    )}
                    {tccApp.invoice_number && (
                      <div>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-0.5">Invoice No.</p>
                        <p className="font-semibold text-slate-700">{tccApp.invoice_number}</p>
                      </div>
                    )}
                    {tccApp.registration_number && (
                      <div>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-0.5">
                          Registration Number
                        </p>
                        <p className="font-mono font-semibold text-slate-700">{tccApp.registration_number}</p>
                      </div>
                    )}
                  </>
                )}
                {isReach && chemical.tonnage_band && (
                  <div>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-0.5">Tonnage Band</p>
                    <p className="font-semibold text-slate-700">{chemical.tonnage_band}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <Calendar className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-slate-800">Validity</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-0.5">Issue Date</p>
                <p className="font-semibold text-slate-800" suppressHydrationWarning>
                  {formatDisplayDate(issuedAt)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-0.5">Expiry Date</p>
                <p className="font-semibold text-slate-800" suppressHydrationWarning>
                  {expiresAt ? formatDisplayDate(expiresAt) : 'N/A'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={cert.status === 'active' ? 'success' : 'warning'}>{cert.status}</Badge>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 p-4 border-b border-slate-100">
              <FileText className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-slate-800">Certificate Document Preview</h3>
            </div>
            {cert.id ? (
              isReach ? (
                <ReachCertificateViewer
                  key={docxPreviewUrl}
                  certificateType="rc"
                  docxUrl={docxPreviewUrl}
                />
              ) : (
                <TccCertificateHtmlPreviewFromApi
                  key={previewVersion}
                  certificateId={cert.id}
                />
              )
            ) : (
              <div className="flex flex-col items-center justify-center h-96 text-slate-400">
                <Shield className="h-12 w-12 mb-3 opacity-30" />
                <p className="font-medium">Certificate preview not available</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
