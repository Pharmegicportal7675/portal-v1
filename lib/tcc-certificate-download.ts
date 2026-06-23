export function buildTccCertificatePdfDownloadUrl(certificateId: string): string {
  return `/api/tcc-certificate/pdf-html?certificateId=${encodeURIComponent(certificateId)}`;
}

export function buildTccCertificateHtmlDataUrl(certificateId: string): string {
  return `/api/tcc-certificate/html-data?certificateId=${encodeURIComponent(certificateId)}`;
}

export function buildTccCertificateApplicationHtmlDataUrl(applicationId: string): string {
  return `/api/tcc-certificate/html-data?applicationId=${encodeURIComponent(applicationId)}`;
}

export function buildTccCertificateApplicationPdfUrl(applicationId: string): string {
  return `/api/tcc-certificate/pdf-html?applicationId=${encodeURIComponent(applicationId)}`;
}
