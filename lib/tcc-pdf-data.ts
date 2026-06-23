export type TccCertificateStoredFile = {
  buffer: Buffer;
  fileName: string;
  contentType: string;
  format: 'pdf';
};

export type TccPdfClient = {
  company_name: string;
  uuid_number?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
};

export type TccPdfChemical = {
  chemical_name: string;
  cas_number: string;
  ec_number?: string | null;
  tonnage_band?: string | null;
};

export type TccPdfApplication = {
  quantity_mt: number;
  export_date?: string | null;
  tracking_id?: string | null;
  registration_number?: string | null;
  remarks?: string | null;
  eu_importer_company_name?: string | null;
  eu_importer_address?: string | null;
  purchase_order_number?: string | null;
  invoice_number?: string | null;
};

export async function buildTccCertificateStoredFile(input: {
  certNumber: string;
  client: TccPdfClient;
  chemical: TccPdfChemical;
  application: TccPdfApplication;
  registrationNumber?: string | null;
  validUntilDate: string;
  deliveryChallanNo?: string | null;
  issuedDate?: string | null;
}): Promise<TccCertificateStoredFile> {
  const { generateTccCertificateHtmlPdf } = await import('@/lib/tcc-certificate-html-pdf-server');

  const pdfBuffer = await generateTccCertificateHtmlPdf({
    certificateNumber: input.certNumber,
    client: input.client,
    chemical: input.chemical,
    application: input.application,
    registrationNumber: input.registrationNumber,
    validUntilDate: input.validUntilDate,
    deliveryChallanNo: input.deliveryChallanNo,
    issuedDate: input.issuedDate,
  });

  return {
    buffer: pdfBuffer,
    fileName: `${input.certNumber}.pdf`,
    contentType: 'application/pdf',
    format: 'pdf',
  };
}
