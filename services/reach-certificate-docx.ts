import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
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

const execFileAsync = promisify(execFile);

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

export function generateReachCertificateDocx(data: ReachCertificateDocxData): Buffer {
  const templatePath = resolveTemplatePath();
  const zip = new PizZip(fs.readFileSync(templatePath));
  const xml = applyPlaceholders(zip.files['word/document.xml'].asText(), data);
  zip.file('word/document.xml', xml);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

const LIBREOFFICE_PATHS = [
  'soffice',
  'libreoffice',
  '/usr/bin/soffice',
  '/usr/bin/libreoffice',
  '/snap/bin/libreoffice',
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
];

export function isLibreOfficeInstalled(): boolean {
  if (process.platform === 'win32') return true;
  for (const bin of LIBREOFFICE_PATHS) {
    if (bin.includes('/') && fs.existsSync(bin)) return true;
  }
  return false;
}

async function convertWithLibreOfficeCli(docxPath: string, outDir: string): Promise<string> {
  let lastError: Error | null = null;
  for (const bin of LIBREOFFICE_PATHS) {
    try {
      await execFileAsync(
        bin,
        ['--headless', '--convert-to', 'pdf', '--outdir', outDir, docxPath],
        { timeout: 120000 }
      );
      const pdfPath = path.join(outDir, `${path.basename(docxPath, '.docx')}.pdf`);
      if (fs.existsSync(pdfPath)) return pdfPath;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError ?? new Error('LibreOffice not found.');
}

async function convertWithLibreOfficeConvert(docxBuffer: Buffer): Promise<Buffer> {
  const libre = await import('libreoffice-convert');
  const convertAsync = (buf: Buffer, ext: string, filter: undefined) =>
    new Promise<Buffer>((resolve, reject) => {
      libre.default.convert(buf, ext, filter, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  return convertAsync(docxBuffer, '.pdf', undefined);
}

async function convertWithWordCom(docxPath: string, pdfPath: string): Promise<void> {
  const ps = `
$ErrorActionPreference = 'Stop'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$doc = $word.Documents.Open('${docxPath.replace(/'/g, "''")}')
$wdFormatPDF = 17
$doc.SaveAs([ref]'${pdfPath.replace(/'/g, "''")}', [ref]$wdFormatPDF)
$doc.Close([ref]$false)
try { $word.Quit() } catch {}
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) | Out-Null
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
[GC]::Collect()
`;
  await execFileAsync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
    timeout: 120000,
  });
}

export async function convertReachDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
  const id = randomUUID();
  const workDir = path.join(tmpdir(), `reach-${id}`);
  const docxPath = path.join(workDir, 'certificate.docx');
  const pdfPath = path.join(workDir, 'certificate.pdf');
  fs.mkdirSync(workDir, { recursive: true });
  fs.writeFileSync(docxPath, docxBuffer);

  try {
    try {
      const cliPdf = await convertWithLibreOfficeCli(docxPath, workDir);
      return fs.readFileSync(cliPdf);
    } catch {
      // try libreoffice-convert npm wrapper
    }

    try {
      return await convertWithLibreOfficeConvert(docxBuffer);
    } catch {
      // try Word COM on Windows
    }

    if (process.platform === 'win32') {
      try {
        await convertWithWordCom(docxPath, pdfPath);
        if (fs.existsSync(pdfPath)) {
          return fs.readFileSync(pdfPath);
        }
      } catch {
        // fall through
      }
    }

    throw new Error(
      'PDF conversion is not available on this server. Install LibreOffice (Linux: sudo apt install libreoffice-writer).'
    );
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

export { EU_REACH_TEMPLATE };
