export function buildReachCertificateHtmlPdfUrl(params: {
  certificateId?: string;
  clientId?: string;
  chemicalId?: string;
  registrationNumber?: string;
  issuedDate?: string;
  validatedDate?: string;
  tonnageBand?: string | null;
  withoutStamp?: boolean;
}): string {
  const search = new URLSearchParams();
  if (params.certificateId) search.set('certificateId', params.certificateId);
  if (params.clientId) search.set('clientId', params.clientId);
  if (params.chemicalId) search.set('chemicalId', params.chemicalId);
  if (params.registrationNumber) search.set('registrationNumber', params.registrationNumber);
  if (params.issuedDate) search.set('issuedDate', params.issuedDate);
  if (params.validatedDate) search.set('validatedDate', params.validatedDate);
  if (params.tonnageBand !== undefined && params.tonnageBand !== null) {
    search.set('tonnageBand', params.tonnageBand);
  }
  if (params.withoutStamp) search.set('withoutStamp', '1');
  return `/api/reach-certificate/pdf-html?${search.toString()}`;
}

export function buildReachCertificatePdfDownloadUrl(certificateId: string): string {
  return buildReachCertificateHtmlPdfUrl({ certificateId });
}

export function buildReachCertificateHtmlDataUrl(params: {
  certificateId?: string;
  clientId?: string;
  chemicalId?: string;
  registrationNumber?: string;
  issuedDate?: string;
  validatedDate?: string;
  tonnageBand?: string | null;
}): string {
  const search = new URLSearchParams();
  if (params.certificateId) search.set('certificateId', params.certificateId);
  if (params.clientId) search.set('clientId', params.clientId);
  if (params.chemicalId) search.set('chemicalId', params.chemicalId);
  if (params.registrationNumber) search.set('registrationNumber', params.registrationNumber);
  if (params.issuedDate) search.set('issuedDate', params.issuedDate);
  if (params.validatedDate) search.set('validatedDate', params.validatedDate);
  if (params.tonnageBand !== undefined && params.tonnageBand !== null) {
    search.set('tonnageBand', params.tonnageBand);
  }
  return `/api/reach-certificate/html-data?${search.toString()}`;
}

export function buildReachCertificateDocxPreviewUrl(certificateId: string): string {
  return `/api/reach-certificate/docx?certificateId=${encodeURIComponent(certificateId)}`;
}

export function buildReachCertificatePdfDownloadUrlByClientChemical(params: {
  clientId: string;
  chemicalId: string;
  registrationNumber?: string;
  issuedDate?: string;
  validatedDate?: string;
  tonnageBand?: string | null;
}): string {
  return buildReachCertificateHtmlPdfUrl(params);
}

export function buildReachCertificateDocxPreviewUrlByClientChemical(params: {
  clientId: string;
  chemicalId: string;
  registrationNumber?: string;
  issuedDate?: string;
  validatedDate?: string;
  tonnageBand?: string | null;
}): string {
  const search = new URLSearchParams({
    clientId: params.clientId,
    chemicalId: params.chemicalId,
  });
  if (params.registrationNumber) search.set('registrationNumber', params.registrationNumber);
  if (params.issuedDate) search.set('issuedDate', params.issuedDate);
  if (params.validatedDate) search.set('validatedDate', params.validatedDate);
  if (params.tonnageBand !== undefined && params.tonnageBand !== null) {
    search.set('tonnageBand', params.tonnageBand);
  }
  return `/api/reach-certificate/docx?${search.toString()}`;
}
