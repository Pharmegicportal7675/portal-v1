import nodemailer from 'nodemailer';
import { buildEmailShell, escapeEmailHtml, formatEmailDate, withEmailLogoAttachments } from '@/lib/email-branding';
import { getRegulatoryRegistrationLabel, isEuReachFramework } from '@/lib/regulatory-registrations';

export interface SmtpConfig {
  smtp_host?: string;
  smtp_port?: number;
  smtp_user?: string;
  smtp_pass?: string;
  smtp_from?: string;
  smtp_cc_default?: string;
}

function buildTransporter(config?: SmtpConfig) {
  // Prefer DB config, fallback to env vars
  const host = config?.smtp_host || process.env.SMTP_HOST;
  const port = config?.smtp_port || parseInt(process.env.SMTP_PORT || '587', 10);
  const user = config?.smtp_user || process.env.SMTP_USER;
  const pass = config?.smtp_pass || process.env.SMTP_PASS;
  const from = config?.smtp_from || process.env.SMTP_FROM || 'Pharmegic Healthcare <noreply@pharmegic-portal.com>';

  if (!host || !user || !pass) {
    return { transporter: null, from };
  }

  return {
    transporter: nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    }),
    from,
  };
}

// ============================================================================
// GENERAL EMAIL
// ============================================================================
interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  cc?: string[];
  smtpConfig?: SmtpConfig;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
    cid?: string;
  }>;
}

export async function sendEmail({ to, subject, html, cc, smtpConfig, attachments }: SendMailOptions) {
  const { transporter, from } = buildTransporter(smtpConfig);

  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from,
        to,
        cc: cc?.join(', '),
        subject,
        html,
        attachments,
      });
      console.log(`[SMTP] Email sent to ${to}: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[SMTP] Failed:', msg);
      logFallbackEmail(to, subject);
      return { success: true, fallback: true, error: msg };
    }
  } else {
    logFallbackEmail(to, subject);
    return { success: true, fallback: true };
  }
}

// ============================================================================
// TCC APPLICATION NOTIFICATION (admin alert on new client submission)
// ============================================================================
interface SendTccApplicationNotificationOptions {
  to: string[];
  clientCompanyName: string;
  chemicalName?: string | null;
  casNumber?: string | null;
  ecNumber?: string | null;
  caseNumber?: string | null;
  quantityMt: number;
  exportDate: string;
  applicationId?: string | null;
  regulatoryFramework: string;
  euImporterCompanyName?: string | null;
  euImporterAddress?: string | null;
  purchaseOrderNumber?: string | null;
  currentAvailableMt?: number | null;
  projectedBalanceMt?: number | null;
  rcCertificateNumber?: string | null;
  rcPeriodStart?: string | null;
  rcPeriodEnd?: string | null;
  poAttachment?: {
    buffer: Buffer;
    fileName: string;
    contentType: string;
  } | null;
  logoUrl?: string | null;
  smtpConfig?: SmtpConfig;
}

function getTccApplicationNotificationHtml(
  details: Omit<SendTccApplicationNotificationOptions, 'to' | 'smtpConfig'>
): string {
  const frameworkLabel = getRegulatoryRegistrationLabel(details.regulatoryFramework);
  const isEuReach = isEuReachFramework(details.regulatoryFramework);
  const rcPeriodLabel =
    details.rcCertificateNumber && details.rcPeriodStart
      ? `Using ${escapeEmailHtml(details.rcCertificateNumber)} (${formatEmailDate(details.rcPeriodStart)} – ${formatEmailDate(details.rcPeriodEnd)}). ${details.currentAvailableMt ?? 0} MT available for this period.`
      : `${details.currentAvailableMt ?? 0} MT available for this period.`;

  const quotaSection = isEuReach
    ? `<div class="section-title">Tonnage Quota Calculator</div>
      <div class="detail">
        <p><strong>Selected substance:</strong> ${escapeEmailHtml(details.chemicalName || '—')}</p>
        <p><strong>CAS number:</strong> ${escapeEmailHtml(details.casNumber || '—')}</p>
        <p><strong>EC number:</strong> ${escapeEmailHtml(details.ecNumber || '—')}</p>
        <p><strong>Current available:</strong> ${details.currentAvailableMt ?? 0} MT</p>
        <p><strong>Requested:</strong> - ${details.quantityMt} MT</p>
        <p><strong>Projected balance:</strong> ${details.projectedBalanceMt ?? 0} MT</p>
        <div class="quota-verified">
          <strong>RC Period &amp; Quota Verified</strong><br />
          ${rcPeriodLabel}
        </div>
      </div>`
    : `<div class="section-title">Notification Only</div>
      <div class="detail">
        <p>This ${escapeEmailHtml(frameworkLabel)} submission is <strong>notification-only</strong>. No EU REACH quota calculation or TCC certificate issuance applies.</p>
      </div>`;

  const bodyHtml = `
      <p>A client has submitted a new <strong>${escapeEmailHtml(frameworkLabel)}</strong> request for your review.</p>

      <div class="section-title">Application Summary</div>
      <div class="detail">
        <p><strong>Regulatory framework:</strong> ${escapeEmailHtml(frameworkLabel)}</p>
        <p><strong>Client:</strong> ${escapeEmailHtml(details.clientCompanyName)}</p>
        ${isEuReach ? `<p><strong>Substance:</strong> ${escapeEmailHtml(details.chemicalName || '—')}</p>` : `<p><strong>Case number:</strong> ${escapeEmailHtml(details.caseNumber || '—')}</p>`}
        <p><strong>Quantity requested:</strong> ${details.quantityMt} MT</p>
        <p><strong>Expected export date:</strong> ${formatEmailDate(details.exportDate)}</p>
      </div>

      <div class="section-title">EU Importer Information</div>
      <div class="detail">
        <p><strong>Company:</strong> ${escapeEmailHtml(details.euImporterCompanyName || '—')}</p>
        <p><strong>Address:</strong> ${escapeEmailHtml(details.euImporterAddress || '—')}</p>
        <p><strong>Purchase order number:</strong> ${escapeEmailHtml(details.purchaseOrderNumber || '—')}</p>
      </div>

      ${quotaSection}

      <p style="font-size:13px;color:#64748b;">${isEuReach ? 'Sign in to the admin portal and open <strong>Approvals</strong> to review this application.' : 'This is a notification-only request. No application record was created in the portal.'}${details.poAttachment ? ' The PO attachment is included with this email.' : ''}</p>`;

  return buildEmailShell({
    subtitle: isEuReach ? 'New TCC Requested' : `New ${frameworkLabel} Request`,
    bodyHtml,
  });
}

export async function sendTccApplicationNotificationEmail({
  to,
  clientCompanyName,
  chemicalName,
  casNumber,
  ecNumber,
  caseNumber,
  quantityMt,
  exportDate,
  applicationId,
  regulatoryFramework,
  euImporterCompanyName,
  euImporterAddress,
  purchaseOrderNumber,
  currentAvailableMt,
  projectedBalanceMt,
  rcCertificateNumber,
  rcPeriodStart,
  rcPeriodEnd,
  poAttachment,
  logoUrl,
  smtpConfig,
}: SendTccApplicationNotificationOptions) {
  const subject = isEuReachFramework(regulatoryFramework)
    ? `New TCC requested — ${clientCompanyName} (${quantityMt} MT)`
    : `New ${getRegulatoryRegistrationLabel(regulatoryFramework)} request — ${clientCompanyName}`;
  const html = getTccApplicationNotificationHtml({
    clientCompanyName,
    chemicalName,
    casNumber,
    ecNumber,
    caseNumber,
    quantityMt,
    exportDate,
    applicationId,
    regulatoryFramework,
    euImporterCompanyName,
    euImporterAddress,
    purchaseOrderNumber,
    currentAvailableMt,
    projectedBalanceMt,
    rcCertificateNumber,
    rcPeriodStart,
    rcPeriodEnd,
    poAttachment,
    logoUrl,
  });

  const attachments = await withEmailLogoAttachments(
    logoUrl,
    poAttachment
      ? [
          {
            filename: poAttachment.fileName,
            content: poAttachment.buffer,
            contentType: poAttachment.contentType,
          },
        ]
      : []
  );

  await sendEmail({
    to: to.join(', '),
    subject,
    html,
    smtpConfig,
    attachments,
  });

  console.log(`[SMTP] TCC application notification sent for application ${applicationId}`);
}

// ============================================================================
// CERTIFICATE EMAIL (with PDF attachment)
// ============================================================================
interface SendCertificateEmailOptions {
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  certificateNumber: string;
  companyName: string;
  chemicalName: string;
  pdfBuffer: Buffer;
  pdfFileName: string;
  attachmentContentType?: string;
  smtpConfig?: SmtpConfig;
  certificateType?: 'TCC' | 'REACH';
  logoUrl?: string | null;
}

export async function sendCertificateEmail({
  to,
  cc,
  bcc,
  subject,
  certificateNumber,
  companyName,
  chemicalName,
  pdfBuffer,
  pdfFileName,
  attachmentContentType = 'application/pdf',
  smtpConfig,
  certificateType = 'TCC',
  logoUrl,
}: SendCertificateEmailOptions) {
  const { transporter, from } = buildTransporter(smtpConfig);

  const html =
    certificateType === 'REACH'
      ? getReachCertificateEmailHtml(companyName, chemicalName, certificateNumber)
      : getCertificateEmailHtml(companyName, chemicalName, certificateNumber);

  const attachments = await withEmailLogoAttachments(logoUrl, [
    {
      filename: pdfFileName,
      content: pdfBuffer,
      contentType: attachmentContentType,
    },
  ]);

  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from,
        to,
        cc: cc?.filter(Boolean).join(', ') || undefined,
        bcc: bcc?.filter(Boolean).join(', ') || undefined,
        subject,
        html,
        attachments,
      });
      console.log(`[SMTP] Certificate email sent: ${info.messageId}`);
      return { success: true };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[SMTP] Certificate email failed:', msg);
      logFallbackEmail(to, subject);
      return { success: true, fallback: true, error: msg };
    }
  } else {
    logFallbackEmail(to, subject);
    return { success: true, fallback: true };
  }
}

function logFallbackEmail(to: string, subject: string) {
  console.log('========================================================================');
  console.log(`[EMAIL FALLBACK] TO: ${to} | SUBJECT: ${subject}`);
  console.log('Configure SMTP in Admin Settings to send real emails.');
  console.log('========================================================================');
}

function getCertificateEmailHtml(
  companyName: string,
  chemicalName: string,
  certNumber: string
): string {
  const bodyHtml = `
      <p>Dear <strong>${escapeEmailHtml(companyName)}</strong>,</p>
      <p>Your Tonnage Compliance Certificate (TCC) application has been <strong>approved</strong>. Please find the official certificate attached to this email.</p>
      <div class="cert-box">
        <div style="font-size:11px;color:#064e3b;font-weight:700;margin-bottom:6px;letter-spacing:0.1em;">CERTIFICATE NUMBER</div>
        <div class="cert-number">${escapeEmailHtml(certNumber)}</div>
      </div>
      <div class="details">
        <div class="detail-row"><span class="label">Issued To</span><span class="value">${escapeEmailHtml(companyName)}</span></div>
        <div class="detail-row"><span class="label">Substance</span><span class="value">${escapeEmailHtml(chemicalName)}</span></div>
        <div class="detail-row"><span class="label">Status</span><span class="value" style="color:#16a34a;">✓ Active &amp; Valid</span></div>
      </div>
      <p style="font-size:13px;color:#64748b;">The PDF certificate is attached to this email. Please store it safely for compliance records. For verification, visit our public verification portal.</p>`;

  return buildEmailShell({
    subtitle: 'Tonnage Compliance Certificate Registry',
    bodyHtml,
  });
}

export interface BulkReachCertificateEmailItem {
  certificateNumber: string;
  chemicalName: string;
  pdfBuffer: Buffer;
  pdfFileName: string;
  attachmentContentType?: string;
}

export async function sendBulkReachCertificatesEmail({
  to,
  cc,
  subject,
  companyName,
  items,
  smtpConfig,
  logoUrl,
}: {
  to: string;
  cc?: string[];
  subject: string;
  companyName: string;
  items: BulkReachCertificateEmailItem[];
  smtpConfig?: SmtpConfig;
  logoUrl?: string | null;
}) {
  const { transporter, from } = buildTransporter(smtpConfig);
  const html = getBulkReachCertificateEmailHtml(
    companyName,
    items.map((item) => ({
      certificateNumber: item.certificateNumber,
      chemicalName: item.chemicalName,
    }))
  );

  const attachments = await withEmailLogoAttachments(
    logoUrl,
    items.map((item) => ({
      filename: item.pdfFileName,
      content: item.pdfBuffer,
      contentType: item.attachmentContentType || 'application/pdf',
    }))
  );

  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from,
        to,
        cc: cc?.filter(Boolean).join(', ') || undefined,
        subject,
        html,
        attachments,
      });
      console.log(`[SMTP] Bulk RC certificate email sent: ${info.messageId}`);
      return { success: true };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[SMTP] Bulk RC certificate email failed:', msg);
      logFallbackEmail(to, subject);
      return { success: true, fallback: true, error: msg };
    }
  }

  logFallbackEmail(to, subject);
  return { success: true, fallback: true };
}

function getBulkReachCertificateEmailHtml(
  companyName: string,
  certificates: { certificateNumber: string; chemicalName: string }[]
): string {
  const rows = certificates
    .map(
      (cert) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-weight:700;color:#064e3b;">${escapeEmailHtml(cert.certificateNumber)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#0f172a;">${escapeEmailHtml(cert.chemicalName)}</td>
        </tr>`
    )
    .join('');

  const bodyHtml = `
      <p>Dear <strong>${escapeEmailHtml(companyName)}</strong>,</p>
      <p>Your <strong>REACH Compliance Certificates (RC)</strong> have been issued. Please find <strong>${certificates.length}</strong> official certificate${certificates.length > 1 ? 's' : ''} attached to this email.</p>
      <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;overflow:hidden;margin:20px 0;font-size:14px;">
        <thead>
          <tr>
            <th style="padding:10px 12px;text-align:left;background:#ecfdf5;color:#064e3b;font-size:11px;letter-spacing:0.08em;">CERTIFICATE NO.</th>
            <th style="padding:10px 12px;text-align:left;background:#ecfdf5;color:#064e3b;font-size:11px;letter-spacing:0.08em;">SUBSTANCE</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="font-size:13px;color:#64748b;">Each RC certificate is attached as a separate PDF file. These certificates are required before applying for a Tonnage Compliance Certificate (TCC).</p>`;

  return buildEmailShell({
    subtitle: 'REACH Compliance Certificate Registry',
    bodyHtml,
  });
}

function getReachCertificateEmailHtml(
  companyName: string,
  chemicalName: string,
  certNumber: string
): string {
  const bodyHtml = `
      <p>Dear <strong>${escapeEmailHtml(companyName)}</strong>,</p>
      <p>Your <strong>REACH Compliance Certificate (RC)</strong> has been issued. Please find the official certificate attached to this email.</p>
      <div class="cert-box">
        <div style="font-size:11px;color:#064e3b;font-weight:700;margin-bottom:6px;letter-spacing:0.1em;">CERTIFICATE NUMBER</div>
        <div class="cert-number">${escapeEmailHtml(certNumber)}</div>
      </div>
      <div class="details">
        <div class="detail-row"><span class="label">Issued To</span><span class="value">${escapeEmailHtml(companyName)}</span></div>
        <div class="detail-row"><span class="label">Substance</span><span class="value">${escapeEmailHtml(chemicalName)}</span></div>
        <div class="detail-row"><span class="label">Status</span><span class="value" style="color:#16a34a;">✓ Active &amp; Valid</span></div>
      </div>
      <p style="font-size:13px;color:#64748b;">The PDF certificate is attached. This RC certificate is required before applying for a Tonnage Coverage Certificate (TCC).</p>`;

  return buildEmailShell({
    subtitle: 'REACH Compliance Certificate Registry',
    bodyHtml,
  });
}
