import fs from 'fs';
import PizZip from 'pizzip';
import { EU_REACH_TEMPLATE } from '@/lib/eu-reach-certificate-template';
import {
  buildEuReachAddressLine1,
  buildReachAddressLines,
  escapeReachXml,
  formatReachCertDate,
  formatReachCertDateLong,
  type ReachCertificateDocxData,
} from '@/lib/reach-certificate-data';

export type { ReachCertificateDocxData } from '@/lib/reach-certificate-data';
export {
  buildEuReachAddressLine1,
  buildReachAddressLines,
  escapeReachXml,
  formatReachCertDate,
  formatReachCertDateLong,
} from '@/lib/reach-certificate-data';

function resolveTemplatePath(): string {
  if (fs.existsSync(EU_REACH_TEMPLATE.runtime)) return EU_REACH_TEMPLATE.runtime;
  throw new Error(
    'EU REACH certificate template not found. Copy your Word file to templates/source/EU_REACH_SOURCE.docx and run: node scripts/prepare-eu-reach-template.mjs (writes templates/EU_REACH_main.docx)'
  );
}

function buildPlaceholderMap(data: ReachCertificateDocxData): Record<string, string> {
  return {
    '{{COMPANY_NAME}}': escapeReachXml(data.companyName),
    '{{ADDR_LINE1}}': escapeReachXml(data.addressLine1),
    '{{ADDR_LINE2}}': escapeReachXml(data.addressLine2),
    '{{ADDR_LINE3}}': escapeReachXml(data.addressLine3),
    '{{CHEMICAL_NAME}}': escapeReachXml(data.chemicalName),
    '{{EC_NUMBER}}': escapeReachXml(data.ecNumber),
    '{{CAS_NUMBER}}': escapeReachXml(data.casNumber),
    '{{REGISTRATION_NUMBER}}': escapeReachXml(data.registrationNumber),
    '{{TONNAGE_BAND}}': escapeReachXml(data.tonnageBand),
    '{{UUID_NUMBER}}': escapeReachXml(data.uuidNumber),
    '{{ISSUED_DATE}}': escapeReachXml(formatReachCertDateLong(data.issuedDate)),
    '{{VALIDATED_DATE}}': escapeReachXml(formatReachCertDateLong(data.validatedDate)),
  };
}

function applyPlaceholders(xml: string, data: ReachCertificateDocxData): string {
  const map = buildPlaceholderMap(data);
  let result = xml;
  for (const [key, value] of Object.entries(map)) {
    result = result.split(key).join(value);
  }

  return result;
}

/** Generate RC certificate DOCX download (PDF uses HTML → Puppeteer elsewhere). */
export function generateReachCertificateDocx(data: ReachCertificateDocxData): Buffer {
  const templatePath = resolveTemplatePath();
  const zip = new PizZip(fs.readFileSync(templatePath));
  const xml = applyPlaceholders(zip.files['word/document.xml'].asText(), data);
  zip.file('word/document.xml', xml);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export { EU_REACH_TEMPLATE };
