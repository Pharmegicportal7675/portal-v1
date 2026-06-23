import type { DbClient } from '@/lib/db/types';
import { resolveTccBranding } from '@/lib/certificate-template-config';
import {
  buildTccHtmlData,
  type BuildTccHtmlDataInput,
  type TccCertificateHtmlData,
} from '@/lib/tcc-certificate-html-data';
import {
  buildTccApplicationPreviewInput,
  buildTccCertificatePdfInputFromStoredCert,
} from '@/lib/tcc-certificate-pdf';
import { resolvePdfRenderBaseUrl } from '@/lib/reach-pdf-render-url';
import { renderTccCertificateHtmlDocument } from '@/services/tcc-certificate-html-pdf-render';
import { generateTccHtmlPdfFromHtml } from '@/services/reach-certificate-puppeteer-pdf';
import { getActiveTemplate } from '@/services/db';

function resolveAbsoluteAssetUrl(url: string | null, baseUrl: string): string | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  if (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://')
  ) {
    return trimmed;
  }
  return `${baseUrl}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
}

function withAbsoluteAssetUrls(
  data: TccCertificateHtmlData,
  baseUrl: string
): TccCertificateHtmlData {
  return {
    ...data,
    logoUrl: resolveAbsoluteAssetUrl(data.logoUrl, baseUrl),
    signatureUrl: resolveAbsoluteAssetUrl(data.signatureUrl, baseUrl),
  };
}

export async function loadTccHtmlDataForInput(
  supabase: DbClient,
  input: BuildTccHtmlDataInput
): Promise<TccCertificateHtmlData> {
  const templateSettings = await getActiveTemplate(supabase);
  const branding = resolveTccBranding(templateSettings);
  const baseUrl = resolvePdfRenderBaseUrl();

  return withAbsoluteAssetUrls(
    buildTccHtmlData(input, {
      accentColor: branding.accent_color,
      logoUrl: branding.logo,
      signatureUrl: branding.signature_image,
      footerText: branding.footer_text,
    }),
    baseUrl
  );
}

export async function loadTccHtmlDataByCertificateId(
  supabase: DbClient,
  certificateId: string
): Promise<TccCertificateHtmlData | null> {
  const { data: cert, error } = await supabase
    .from('certificates')
    .select(
      `
      certificate_number,
      expires_at,
      issued_at,
      registration_number,
      tcc_application_id,
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
      ),
      tcc_applications!certificates_tcc_application_id_fkey (
        quantity_mt,
        export_date,
        tracking_id,
        registration_number,
        remarks,
        eu_importer_company_name,
        eu_importer_address,
        purchase_order_number,
        invoice_number
      )
    `
    )
    .eq('id', certificateId)
    .single();

  if (error || !cert) return null;

  const input = await buildTccCertificatePdfInputFromStoredCert(supabase, cert);
  return loadTccHtmlDataForInput(supabase, {
    ...input,
    issuedDate: cert.issued_at?.split('T')[0] || input.application.export_date || undefined,
  });
}

export async function loadTccHtmlDataByApplicationId(
  supabase: DbClient,
  applicationId: string
): Promise<TccCertificateHtmlData> {
  const input = await buildTccApplicationPreviewInput(supabase, applicationId);
  return loadTccHtmlDataForInput(supabase, input);
}

export async function generateTccCertificateHtmlPdf(
  input: BuildTccHtmlDataInput
): Promise<Buffer> {
  const { createAdminClient } = await import('@/lib/db/admin');
  const data = await loadTccHtmlDataForInput(createAdminClient(), input);
  const html = await renderTccCertificateHtmlDocument(data);
  return generateTccHtmlPdfFromHtml(html);
}
