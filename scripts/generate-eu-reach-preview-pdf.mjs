/**
 * Generates public/previews/eu-reach-certificate-sample.pdf for admin Settings preview.
 * Run: node scripts/prepare-eu-reach-template.mjs && node scripts/generate-eu-reach-preview-pdf.mjs
 */
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import PizZip from 'pizzip';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

const SAMPLE = {
  companyName: 'Example Pharma Ltd',
  addressLine1: '123 Industrial Estate, Sample Road, Ahmedabad - 382445, Gujarat,',
  addressLine3: 'India',
  chemicalName: 'Example Chemical Substance',
  casNumber: '000-00-0',
  ecNumber: '000-000-0',
  tonnageBand: '10–100 tpa',
  registrationNumber: '01-2119000000-00-0000',
  uuidNumber: 'ECHA-00000000-0000-4000-8000-000000000002',
  issuedDate: '1 January 2026',
  validatedDate: '31 December 2026',
};

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function applyPlaceholders(xml) {
  const map = {
    '{{COMPANY_NAME}}': escapeXml(SAMPLE.companyName),
    '{{ADDR_LINE1}}': escapeXml(SAMPLE.addressLine1),
    '{{ADDR_LINE2}}': escapeXml('Gujarat'),
    '{{ADDR_LINE3}}': escapeXml(SAMPLE.addressLine3),
    '{{CHEMICAL_NAME}}': escapeXml(SAMPLE.chemicalName),
    '{{EC_NUMBER}}': escapeXml(SAMPLE.ecNumber),
    '{{CAS_NUMBER}}': escapeXml(SAMPLE.casNumber),
    '{{REGISTRATION_NUMBER}}': escapeXml(SAMPLE.registrationNumber),
    '{{TONNAGE_BAND}}': escapeXml(SAMPLE.tonnageBand),
    '{{UUID_NUMBER}}': escapeXml(SAMPLE.uuidNumber),
    '{{ISSUED_DATE}}': escapeXml(SAMPLE.issuedDate),
    '{{VALIDATED_DATE}}': escapeXml(SAMPLE.validatedDate),
  };

  let result = xml;
  for (const [key, value] of Object.entries(map)) {
    result = result.split(key).join(value);
  }
  return result;
}

async function convertWithWordCom(docxPath, pdfPath) {
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

const templatePath = path.join(projectRoot, 'templates', 'EU_REACH_main.docx');
const outDir = path.join(projectRoot, 'public', 'previews');
const docxOut = path.join(outDir, 'eu-reach-certificate-sample.docx');
const pdfOut = path.join(outDir, 'eu-reach-certificate-sample.pdf');

if (!fs.existsSync(templatePath)) {
  console.error(`Template not found: ${templatePath}`);
  console.error('Run: node scripts/prepare-eu-reach-template.mjs');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const zip = new PizZip(fs.readFileSync(templatePath));
const xml = applyPlaceholders(zip.files['word/document.xml'].asText());
zip.file('word/document.xml', xml);
fs.writeFileSync(docxOut, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));

let converted = false;
if (process.platform === 'win32') {
  try {
    await convertWithWordCom(docxOut, pdfOut);
    converted = fs.existsSync(pdfOut);
  } catch (err) {
    console.warn('Word COM conversion failed:', err.message);
  }
}

if (!converted || !fs.existsSync(pdfOut)) {
  console.warn(
    'Sample PDF not generated (LibreOffice removed — production uses puppeteer-core + chromium-min).'
  );
  console.warn('DOCX sample written; use admin RC HTML preview for PDF on the server.');
  process.exit(0);
}

console.log(`Settings preview DOCX kept at ${docxOut} (${fs.statSync(docxOut).size} bytes)`);
if (fs.existsSync(path.join(outDir, 'rc-template-2-sample.pdf'))) {
  fs.unlinkSync(path.join(outDir, 'rc-template-2-sample.pdf'));
}
console.log(`Settings preview PDF written to ${pdfOut} (${fs.statSync(pdfOut).size} bytes)`);
