export function buildTccCertificatePdfDownloadUrl(certificateId: string): string {
  return `/api/tcc-certificate/pdf-html?certificateId=${encodeURIComponent(certificateId)}`;
}

export function buildTccCertificateHtmlDataUrl(certificateId: string): string {
  return `/api/tcc-certificate/html-data?certificateId=${encodeURIComponent(certificateId)}`;
}

export function buildTccCertificateApplicationHtmlDataUrl(
  applicationId: string,
  cacheBust?: string | number
): string {
  const base = `/api/tcc-certificate/html-data?applicationId=${encodeURIComponent(applicationId)}`;
  if (cacheBust == null || cacheBust === '') return base;
  return `${base}&v=${encodeURIComponent(String(cacheBust))}`;
}

export function buildTccCertificateApplicationPdfUrl(applicationId: string): string {
  return `/api/tcc-certificate/pdf-html?applicationId=${encodeURIComponent(applicationId)}`;
}
