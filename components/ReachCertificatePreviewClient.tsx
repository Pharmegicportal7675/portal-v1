'use client';

import { useMemo, useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  issueReachCertificateFromPreviewAction,
  sendReachCertificateEmailAction,
  resendReachCertificateEmailAction,
  updateReachCertificateAction,
} from '@/actions/reach';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { DatePicker } from '@/components/ui/DatePicker';
import { FormLabel } from '@/components/ui/FormLabel';
import { Select } from '@/components/ui/Select';
import { toast } from '@/store/toast';
import {
  ArrowLeft,
  Download,
  FileText,
  ShieldCheck,
  Mail,
  RefreshCw,
  CheckCircle2,
  PenLine,
} from 'lucide-react';
import ReachCertificateViewer from '@/components/ReachCertificateViewer';
import { buildReachHtmlData } from '@/lib/reach-certificate-html-data';
import {
  buildReachCertificateDocxPreviewUrl,
  buildReachCertificateDocxPreviewUrlByClientChemical,
  buildReachCertificatePdfDownloadUrl,
  buildReachCertificatePdfDownloadUrlByClientChemical,
} from '@/lib/reach-certificate-download';
import { CertificatePdfDownloadLink } from '@/components/CertificatePdfDownloadLink';
import { CertificateMailHistoryList } from '@/components/CertificateMailHistoryList';
import { useLayoutStore } from '@/store/layout';
type ReachCertificatePreviewClientProps = {
  clientId: string;
  chemicalId: string;
  client: {
    company_name: string;
    email: string;
    uuid_number: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
  };
  chemical: {
    chemical_name: string;
    cas_number: string;
    ec_number: string | null;
    tonnage_band: string | null;
  };
  cert: {
    id: string;
    certificate_number: string;
    registration_number: string | null;
    issued_at: string;
    expires_at: string | null;
    status: string;
    file_url: string | null;
    mail_sent: boolean;
    mail_sent_at: string | null;
    mail_resend_count: number;
    last_resend_at: string | null;
  } | null;
  defaults: {
    registrationNumber: string;
    issuedDate: string;
    validatedDate: string;
    tonnageBand?: string;
  };
  mailRecipients: {
    to: string;
    cc: string[];
  } | null;
  mailSentHistory: string[];
  branding?: {
    accentColor?: string | null;
    logoUrl?: string | null;
    signatureUrl?: string | null;
    footerText?: string | null;
  };
};

function formatEmailList(emails: string[]): string {
  return emails.length > 0 ? emails.join(', ') : '—';
}

export default function ReachCertificatePreviewClient({
  clientId,
  chemicalId,
  client,
  chemical,
  cert,
  defaults,
  mailRecipients,
  mailSentHistory,
  branding,
}: ReachCertificatePreviewClientProps) {
  const router = useRouter();
  const setCustomBreadcrumb = useLayoutStore((state) => state.setCustomBreadcrumb);
  const [isIssuing, startIssueTransition] = useTransition();
  const [isUpdating, startUpdateTransition] = useTransition();
  const [isSending, startSendTransition] = useTransition();
  const [isResending, startResendTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const isPending = !cert;
  const totalSent = cert ? cert.mail_resend_count + (cert.mail_sent ? 1 : 0) : 0;

  const [registrationNumber, setRegistrationNumber] = useState(defaults.registrationNumber);
  const [issuedDate, setIssuedDate] = useState(defaults.issuedDate);
  const [validatedDate, setValidatedDate] = useState(defaults.validatedDate);
  const [tonnageBand, setTonnageBand] = useState(defaults.tonnageBand || chemical.tonnage_band || '');
  const [previewVersion, setPreviewVersion] = useState(0);

  const fieldsMatchDefaults =
    registrationNumber === defaults.registrationNumber &&
    issuedDate === defaults.issuedDate &&
    validatedDate === defaults.validatedDate &&
    (tonnageBand || '') === (defaults.tonnageBand || chemical.tonnage_band || '');

  const docxPreviewUrl = useMemo(() => {
    if (cert && !isEditing && fieldsMatchDefaults) {
      return `${buildReachCertificateDocxPreviewUrl(cert.id)}&v=${previewVersion}`;
    }

    return `${buildReachCertificateDocxPreviewUrlByClientChemical({
      clientId,
      chemicalId,
      registrationNumber: registrationNumber.trim() || '—',
      issuedDate,
      validatedDate,
      tonnageBand,
    })}&v=${previewVersion}`;
  }, [
    cert,
    isEditing,
    fieldsMatchDefaults,
    clientId,
    chemicalId,
    registrationNumber,
    issuedDate,
    validatedDate,
    tonnageBand,
    previewVersion,
  ]);

  const htmlData = useMemo(
    () =>
      buildReachHtmlData(
        {
          company_name: client.company_name,
          address: client.address,
          city: client.city,
          state: client.state,
          postal_code: client.postal_code,
          country: client.country,
          uuid_number: client.uuid_number,
        },
        {
          chemical_name: chemical.chemical_name,
          cas_number: chemical.cas_number,
          ec_number: chemical.ec_number,
          tonnage_band: chemical.tonnage_band,
        },
        {
          registrationNumber: registrationNumber.trim() || '—',
          issuedDate,
          validatedDate,
          tonnageBand,
          accentColor: branding?.accentColor,
          logoUrl: branding?.logoUrl,
          signatureUrl: branding?.signatureUrl,
          footerText: branding?.footerText,
        }
      ),
    [
      client,
      chemical,
      registrationNumber,
      issuedDate,
      validatedDate,
      tonnageBand,
      branding,
    ]
  );

  useEffect(() => {
    setCustomBreadcrumb(client.company_name);
    return () => setCustomBreadcrumb(null);
  }, [client.company_name, setCustomBreadcrumb]);

  const downloadPdfUrl = cert
    ? buildReachCertificatePdfDownloadUrl(cert.id)
    : buildReachCertificatePdfDownloadUrlByClientChemical({
        clientId,
        chemicalId,
        registrationNumber: registrationNumber.trim() || '—',
        issuedDate,
        validatedDate,
        tonnageBand,
      });
  const downloadDocxUrl = docxPreviewUrl;
  const downloadFileName = cert
    ? `${cert.certificate_number}.pdf`
    : `RC-preview-${chemicalId.slice(0, 8)}.pdf`;
  const downloadLabel = 'Download PDF';

  const backHref = `/admin/clients/${clientId}`;

  const handleUpdate = () => {
    if (!cert) return;
    if (!registrationNumber.trim()) {
      toast.error('Registration number is required.');
      return;
    }
    if (!issuedDate || !validatedDate) {
      toast.error('Issued date and validated date are required.');
      return;
    }

    startUpdateTransition(async () => {
      const res = await updateReachCertificateAction(cert.id, {
        registrationNumber: registrationNumber.trim(),
        issuedDate,
        validatedDate,
        tonnageBand,
      });
      if (res.success) {
        toast.success(res.message || 'RC Certificate updated.');
        setIsEditing(false);
        setPreviewVersion((v) => v + 1);
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to update RC certificate.');
      }
    });
  };

  const handleIssue = () => {
    if (!registrationNumber.trim()) {
      toast.error('Registration number is required before issuing.');
      return;
    }
    if (!issuedDate || !validatedDate) {
      toast.error('Issued date and validated date are required.');
      return;
    }

    startIssueTransition(async () => {
      const res = await issueReachCertificateFromPreviewAction(clientId, chemicalId, {
        registrationNumber: registrationNumber.trim(),
        issuedDate,
        validatedDate,
        tonnageBand,
      });
      if (res.success) {
        toast.success(res.message || 'RC Certificate issued successfully.');
        router.push(backHref);
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to issue RC certificate.');
      }
    });
  };

  const handleSendMail = () => {
    if (!cert) return;
    startSendTransition(async () => {
      const res = await sendReachCertificateEmailAction(cert.id);
      if (res.success) {
        toast.success(res.message || 'Certificate email sent successfully.');
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to send email.');
      }
    });
  };

  const handleResendMail = () => {
    if (!cert) return;
    startResendTransition(async () => {
      const res = await resendReachCertificateEmailAction(cert.id);
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
            <h1 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2 flex-wrap">
              RC Certificate Review
              {cert ? (
                <span className="font-mono text-primary text-base">{cert.certificate_number}</span>
              ) : (
                <Badge variant="warning" className="text-[10px] uppercase font-bold">
                  Pending
                </Badge>
              )}
            </h1>
            <p className="text-sm text-slate-500 font-medium">
              {client.company_name} · {chemical.chemical_name} — EU REACH certificate preview
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <CertificatePdfDownloadLink
            pdfUrl={downloadPdfUrl}
            docxUrl={downloadDocxUrl}
            fileName={downloadFileName}
            certificateType="rc"
            htmlData={htmlData}
            clientId={clientId}
            chemicalId={chemicalId}
            registrationNumber={registrationNumber.trim() || '—'}
            issuedDate={issuedDate}
            validatedDate={validatedDate}
            tonnageBand={tonnageBand}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 transition-colors disabled:opacity-60"
          >
            <Download className="h-4 w-4" /> {downloadLabel}
          </CertificatePdfDownloadLink>

          {!isPending && cert && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing((prev) => !prev)}
              className="gap-1.5"
            >
              <PenLine className="h-4 w-4" />
              {isEditing ? 'Cancel Edit' : 'Edit Details'}
            </Button>
          )}

          {!isPending && cert && (
            <>
            {!cert.mail_sent ? (
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
            )}
            </>
          )}
        </div>
      </div>

      {cert?.mail_sent && mailRecipients && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs font-medium text-blue-700 space-y-1">
          <p>
            <strong>TO:</strong> {mailRecipients.to}
          </p>
          <p>
            <strong>CC:</strong> {formatEmailList(mailRecipients.cc)}
          </p>
          <CertificateMailHistoryList timestamps={mailSentHistory} />
        </div>
      )}

      {(isPending || (cert && isEditing)) && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-100 mb-4">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-slate-800">
              {isPending ? 'Confirm details before issuing' : 'Update certificate details'}
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <FormLabel required>Registration Number</FormLabel>
              <Input
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value)}
                placeholder="01-2119493908-18-0028"
              />
            </div>
            <div>
              <FormLabel>Tonnage Band</FormLabel>
              <Select
                value={tonnageBand}
                onChange={(e) => setTonnageBand(e.target.value)}
                options={[
                  { value: '', label: 'None' },
                  { value: '1-10 tonnes', label: '1-10 tonnes' },
                  { value: '10-100 tonnes', label: '10-100 tonnes' },
                  { value: '100-1000 tonnes', label: '100-1000 tonnes' },
                  { value: '1000+ tonnes', label: '1000+ tonnes' },
                ]}
              />
            </div>
            <div>
              <FormLabel required>Issued Date</FormLabel>
              <DatePicker value={issuedDate} onChange={setIssuedDate} required />
            </div>
            <div>
              <FormLabel required>Validated Date</FormLabel>
              <DatePicker
                value={validatedDate}
                onChange={setValidatedDate}
                min={issuedDate || undefined}
                required
              />
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-3">
            {isPending
              ? 'Review the certificate preview below. Update fields if needed, then issue the RC certificate.'
              : 'Save changes to update the stored certificate and regenerate the PDF/DOCX files.'}
          </p>
          {cert && isEditing && (
            <div className="flex justify-end mt-4">
              <Button
                onClick={handleUpdate}
                isLoading={isUpdating}
                disabled={isUpdating}
                className="bg-teal-700 hover:bg-teal-800 gap-2"
              >
                <ShieldCheck className="h-4 w-4" />
                Save Certificate Changes
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 p-4 border-b border-slate-100">
          <FileText className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-slate-800">EU REACH Registration Certificate</h3>
        </div>
        <ReachCertificateViewer
          key={JSON.stringify(htmlData)}
          certificateType="rc"
          docxUrl={docxPreviewUrl}
          htmlData={htmlData}
        />
      </div>

      {isPending && (
        <div className="flex justify-end">
          <Button
            onClick={handleIssue}
            isLoading={isIssuing}
            disabled={isIssuing}
            className="bg-teal-700 hover:bg-teal-800 gap-2"
          >
            <ShieldCheck className="h-4 w-4" />
            Issue Certificate
          </Button>
        </div>
      )}
    </div>
  );
}
