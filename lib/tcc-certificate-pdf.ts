import type { DbClient } from '@/lib/db/types';
import type { TccPdfApplication, TccPdfChemical, TccPdfClient } from '@/lib/tcc-pdf-data';
import { CERTIFICATES_BUCKET } from '@/lib/storage';
import { generateTccCertificateHtmlPdf } from '@/lib/tcc-certificate-html-pdf-server';
import { findReachCertificateForExportDate, REACH_CERTIFICATE_TYPE } from '@/lib/reach-certificate';

const REACH_QUOTA_CERT_SELECT =
  'id, certificate_number, client_id, chemical_id, status, expires_at, issued_at, type, allocated_quantity, tonnage_band, registration_number';

type TccCertPdfInput = {
  certificateNumber: string;
  client: TccPdfClient;
  chemical: TccPdfChemical;
  application: TccPdfApplication;
  registrationNumber?: string | null;
  validUntilDate: string;
  deliveryChallanNo?: string | null;
  issuedDate?: string | null;
};

export type { TccCertPdfInput };

const PDF_CONTENT_TYPE = 'application/pdf';

export type TccCertificateDownloadFile = {
  buffer: Buffer;
  contentType: string;
  fileName: string;
  format: 'pdf';
};

async function downloadStorageFile(
  supabase: DbClient,
  fileName: string
): Promise<Buffer | null> {
  const { data, error } = await supabase.storage.from(CERTIFICATES_BUCKET).download(fileName);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

function cachePdfToStorage(
  supabase: DbClient,
  certificateNumber: string,
  pdfBuffer: Buffer
): void {
  void supabase.storage
    .from(CERTIFICATES_BUCKET)
    .upload(`${certificateNumber}.pdf`, pdfBuffer, {
      contentType: PDF_CONTENT_TYPE,
      upsert: true,
    })
    .then(({ error }) => {
      if (error) {
        console.warn(`[TCC PDF] Failed to cache ${certificateNumber}.pdf:`, error.message);
      }
    });
}

/** Resolves the best available TCC certificate PDF for download/email. */
export async function resolveTccCertificateDownloadFile(
  supabase: DbClient,
  input: TccCertPdfInput
): Promise<TccCertificateDownloadFile> {
  const certNumber = input.certificateNumber;

  try {
    const pdfBuffer = await generateTccCertificateHtmlPdf(input);
    cachePdfToStorage(supabase, certNumber, pdfBuffer);
    return {
      buffer: pdfBuffer,
      contentType: PDF_CONTENT_TYPE,
      fileName: `${certNumber}.pdf`,
      format: 'pdf',
    };
  } catch (err) {
    const storedPdf = await downloadStorageFile(supabase, `${certNumber}.pdf`);
    if (storedPdf) {
      return {
        buffer: storedPdf,
        contentType: PDF_CONTENT_TYPE,
        fileName: `${certNumber}.pdf`,
        format: 'pdf',
      };
    }

    const message = err instanceof Error ? err.message : 'TCC certificate PDF generation failed.';
    throw new Error(message);
  }
}

export async function resolveTccCertificatePdfBuffer(
  supabase: DbClient,
  input: TccCertPdfInput
): Promise<Buffer> {
  const file = await resolveTccCertificateDownloadFile(supabase, input);
  return file.buffer;
}

export async function resolveTccPdfChemicalTonnageBand(
  supabase: DbClient,
  params: {
    clientId: string;
    chemicalId: string;
    exportDate?: string | null;
    reachCertificateId?: string | null;
    chemical: TccPdfChemical;
  }
): Promise<TccPdfChemical> {
  const { data: reachCerts } = await supabase
    .from('certificates')
    .select(REACH_QUOTA_CERT_SELECT)
    .eq('client_id', params.clientId)
    .eq('chemical_id', params.chemicalId)
    .eq('type', REACH_CERTIFICATE_TYPE)
    .neq('status', 'revoked');

  const reachCert =
    (params.reachCertificateId
      ? (reachCerts || []).find((c: any) => c.id === params.reachCertificateId)
      : null) ||
    (params.exportDate
      ? findReachCertificateForExportDate(reachCerts || [], params.chemicalId, params.exportDate)
      : null);

  return {
    ...params.chemical,
    tonnage_band: reachCert?.tonnage_band || params.chemical.tonnage_band || null,
  };
}

export async function buildTccCertificatePdfInputFromStoredCert(
  supabase: DbClient,
  cert: {
    certificate_number: string;
    expires_at?: string | null;
    registration_number?: string | null;
    tcc_application_id?: string | null;
    clients: TccPdfClient | TccPdfClient[];
    chemicals?: TccPdfChemical | TccPdfChemical[] | null;
    tcc_applications?:
      | (TccPdfApplication & { chemicals?: TccPdfChemical | TccPdfChemical[] | null })
      | (TccPdfApplication & { chemicals?: TccPdfChemical | TccPdfChemical[] | null })[]
      | null;
  }
): Promise<TccCertPdfInput> {
  if (cert.tcc_application_id) {
    const preview = await buildTccApplicationPreviewInput(supabase, cert.tcc_application_id);
    return {
      ...preview,
      certificateNumber: cert.certificate_number,
      registrationNumber: cert.registration_number?.trim() || preview.registrationNumber,
      validUntilDate: cert.expires_at?.split('T')[0] || preview.validUntilDate,
    };
  }

  return buildTccCertificatePdfInputFromCert(cert);
}

export function buildTccCertificatePdfInputFromCert(cert: {
  certificate_number: string;
  expires_at?: string | null;
  registration_number?: string | null;
  clients: TccPdfClient | TccPdfClient[];
  chemicals?: TccPdfChemical | TccPdfChemical[] | null;
  tcc_applications?:
    | (TccPdfApplication & { chemicals?: TccPdfChemical | TccPdfChemical[] | null })
    | (TccPdfApplication & { chemicals?: TccPdfChemical | TccPdfChemical[] | null })[]
    | null;
}): TccCertPdfInput {
  const applicationRaw = cert.tcc_applications;
  const application = Array.isArray(applicationRaw) ? applicationRaw[0] : applicationRaw;
  const client = Array.isArray(cert.clients) ? cert.clients[0] : cert.clients;
  const chemicalFromCert = cert.chemicals
    ? Array.isArray(cert.chemicals)
      ? cert.chemicals[0]
      : cert.chemicals
    : null;
  const chemicalFromApp = application?.chemicals
    ? Array.isArray(application.chemicals)
      ? application.chemicals[0]
      : application.chemicals
    : null;
  const chemical = chemicalFromCert || chemicalFromApp;

  if (!application || !chemical || !client) {
    throw new Error('TCC certificate data is incomplete.');
  }

  return {
    certificateNumber: cert.certificate_number,
    client,
    chemical,
    application,
    registrationNumber: cert.registration_number,
    validUntilDate: cert.expires_at?.split('T')[0] || application.export_date || '',
    deliveryChallanNo:
      application.purchase_order_number?.trim() || application.tracking_id || undefined,
  };
}

export async function buildTccApplicationPreviewInput(
  supabase: DbClient,
  applicationId: string
): Promise<TccCertPdfInput> {
  const { data: app, error } = await supabase
    .from('tcc_applications')
    .select(
      `
      id,
      client_id,
      chemical_id,
      quantity_mt,
      export_date,
      tracking_id,
      registration_number,
      remarks,
      certificate_issue_date,
      reach_certificate_id,
      eu_importer_company_name,
      eu_importer_address,
      purchase_order_number,
      invoice_number,
      clients (
        company_name,
        uuid_number,
        address,
        city,
        state,
        postal_code,
        country
      ),
      chemicals (
        chemical_name,
        cas_number,
        ec_number,
        tonnage_band
      )
    `
    )
    .eq('id', applicationId)
    .single();

  if (error || !app) {
    throw new Error('TCC application not found.');
  }

  const client = Array.isArray(app.clients) ? app.clients[0] : app.clients;
  const chemicalRaw = Array.isArray(app.chemicals) ? app.chemicals[0] : app.chemicals;

  if (!client || !chemicalRaw) {
    throw new Error('TCC application data is incomplete.');
  }

  const { data: reachCerts } = await supabase
    .from('certificates')
    .select(REACH_QUOTA_CERT_SELECT)
    .eq('client_id', app.client_id)
    .eq('chemical_id', app.chemical_id)
    .eq('type', REACH_CERTIFICATE_TYPE)
    .neq('status', 'revoked');

  const reachCert =
    (app.reach_certificate_id
      ? (reachCerts || []).find((c: any) => c.id === app.reach_certificate_id)
      : null) ||
    (app.export_date
      ? findReachCertificateForExportDate(reachCerts || [], app.chemical_id, app.export_date)
      : null);

  const chemical = await resolveTccPdfChemicalTonnageBand(supabase, {
    clientId: app.client_id,
    chemicalId: app.chemical_id,
    exportDate: app.export_date,
    reachCertificateId: app.reach_certificate_id,
    chemical: chemicalRaw,
  });

  const issueDateRaw = app.certificate_issue_date
    ? String(app.certificate_issue_date).split('T')[0]
    : new Date().toISOString().split('T')[0];
  const issueDate = new Date(`${issueDateRaw}T12:00:00`);
  const expiryDate = new Date(issueDate);
  expiryDate.setFullYear(expiryDate.getFullYear() + 1);

  const application: TccPdfApplication = {
    quantity_mt: app.quantity_mt,
    export_date: app.export_date,
    tracking_id: app.tracking_id,
    registration_number: app.registration_number,
    remarks: app.remarks,
    eu_importer_company_name: app.eu_importer_company_name,
    eu_importer_address: app.eu_importer_address,
    purchase_order_number: app.purchase_order_number,
    invoice_number: app.invoice_number,
  };

  return {
    certificateNumber: 'TCC-PREVIEW',
    client,
    chemical,
    application,
    registrationNumber:
      reachCert?.registration_number?.trim() || app.registration_number?.trim() || null,
    validUntilDate: expiryDate.toISOString().split('T')[0],
    deliveryChallanNo: app.tracking_id?.trim() || app.purchase_order_number?.trim() || undefined,
  };
}
