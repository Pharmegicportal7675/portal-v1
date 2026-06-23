import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveRcBranding } from '@/lib/certificate-template-config';
import {
  loadReachCertificateInputByCertificateId,
  loadReachCertificateInputByClientChemical,
  type LoadedReachCertificateInput,
} from '@/lib/reach-certificate-api-input';
import { buildReachHtmlData, type ReachCertificateHtmlData } from '@/lib/reach-certificate-html-data';
import type { ReachCertPdfInput } from '@/lib/reach-certificate-preview';
import {
  type ReachPrintTokenPayload,
} from '@/lib/reach-certificate-print-token';
import { renderReachCertificateHtmlDocument } from '@/services/reach-certificate-html-pdf-render';
import { generateReachHtmlPdfFromHtml } from '@/services/reach-certificate-puppeteer-pdf';
import { getActiveTemplate } from '@/services/db';
import { resolvePdfRenderBaseUrl } from '@/lib/reach-pdf-render-url';

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
  data: ReachCertificateHtmlData,
  baseUrl: string
): ReachCertificateHtmlData {
  return {
    ...data,
    logoUrl: resolveAbsoluteAssetUrl(data.logoUrl, baseUrl),
    signatureUrl: resolveAbsoluteAssetUrl(data.signatureUrl, baseUrl),
  };
}

export function toReachPrintTokenPayload(input: LoadedReachCertificateInput): ReachPrintTokenPayload {
  if (input.certificateId) {
    return { certificateId: input.certificateId };
  }
  return {
    clientId: input.clientId,
    chemicalId: input.chemicalId,
    registrationNumber: input.registrationNumber,
    issuedDate: input.issuedDate,
    validatedDate: input.validatedDate,
    tonnageBand: input.tonnageBand,
  };
}

export async function loadReachHtmlDataFromPrintToken(
  supabase: SupabaseClient,
  tokenPayload: ReachPrintTokenPayload
): Promise<ReachCertificateHtmlData | null> {
  const templateSettings = await getActiveTemplate(supabase);
  const branding = resolveRcBranding(templateSettings);
  const baseUrl = resolvePdfRenderBaseUrl();

  if (tokenPayload.certificateId) {
    const input = await loadReachCertificateInputByCertificateId(
      supabase,
      tokenPayload.certificateId
    );
    if (!input) return null;
    return withAbsoluteAssetUrls(
      buildReachHtmlData(input.client, input.chemical, {
        registrationNumber: input.registrationNumber,
        issuedDate: input.issuedDate,
        validatedDate: input.validatedDate,
        tonnageBand: input.tonnageBand,
        accentColor: branding.accent_color,
        logoUrl: branding.logo,
        signatureUrl: branding.signature_image,
        footerText: branding.footer_text,
      }),
      baseUrl
    );
  }

  if (!tokenPayload.clientId || !tokenPayload.chemicalId) return null;

  const input = await loadReachCertificateInputByClientChemical(supabase, {
    clientId: tokenPayload.clientId,
    chemicalId: tokenPayload.chemicalId,
    registrationNumber: tokenPayload.registrationNumber,
    issuedDate: tokenPayload.issuedDate,
    validatedDate: tokenPayload.validatedDate,
    tonnageBand: tokenPayload.tonnageBand,
  });

  if (!input) return null;

  return withAbsoluteAssetUrls(
    buildReachHtmlData(input.client, input.chemical, {
      registrationNumber: input.registrationNumber,
      issuedDate: input.issuedDate,
      validatedDate: input.validatedDate,
      tonnageBand: input.tonnageBand,
      accentColor: branding.accent_color,
      logoUrl: branding.logo,
      signatureUrl: branding.signature_image,
      footerText: branding.footer_text,
    }),
    baseUrl
  );
}

export async function loadReachHtmlDataForInput(
  supabase: SupabaseClient,
  input: LoadedReachCertificateInput | ReachCertPdfInput
): Promise<ReachCertificateHtmlData> {
  const templateSettings = await getActiveTemplate(supabase);
  const branding = resolveRcBranding(templateSettings);
  const baseUrl = resolvePdfRenderBaseUrl();

  return withAbsoluteAssetUrls(
    buildReachHtmlData(input.client, input.chemical, {
      registrationNumber: input.registrationNumber,
      issuedDate: input.issuedDate,
      validatedDate: input.validatedDate,
      tonnageBand: input.tonnageBand,
      accentColor: branding.accent_color,
      logoUrl: branding.logo,
      signatureUrl: branding.signature_image,
      footerText: branding.footer_text,
    }),
    baseUrl
  );
}

export async function generateReachCertificateHtmlPdf(
  input: LoadedReachCertificateInput
): Promise<Buffer> {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const data = await loadReachHtmlDataForInput(createAdminClient(), input);
  const html = await renderReachCertificateHtmlDocument(data);
  return generateReachHtmlPdfFromHtml(html);
}
