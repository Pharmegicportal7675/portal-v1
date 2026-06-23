/**
 * Builds EU REACH certificate template from the master Word source.
 *
 * Edit design: templates/source/EU_REACH_SOURCE.docx
 * Output: templates/EU_REACH_main.docx — used everywhere (print/PDF/preview)
 *
 * Run: node scripts/prepare-eu-reach-template.mjs
 */
import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';

const root = process.cwd();
const sourceDir = path.join(root, 'templates', 'source');
const source = path.join(sourceDir, 'EU_REACH_SOURCE.docx');
const target = path.join(root, 'templates', 'EU_REACH_main.docx');

if (!fs.existsSync(source)) {
  console.error('templates/source/EU_REACH_SOURCE.docx not found.');
  console.error(
    'Copy your EU REACH REGISTRATION CERTIFICATE.docx to templates/source/EU_REACH_SOURCE.docx'
  );
  process.exit(1);
}

const zip = new PizZip(fs.readFileSync(source));
let xml = zip.files['word/document.xml'].asText();

const textReplacements = [
  ['C-1/394, Phase II, G.I.D.C. Estate, Vatva, Ahmedabad: 382445,', '{{ADDR_LINE1}}'],
  ['01-2119458771-32-0109', '{{REGISTRATION_NUMBER}}'],
  ['1 January 2026', '{{ISSUED_DATE}}'],
  ['31 December 2026', '{{VALIDATED_DATE}}'],
];

for (const [from, to] of textReplacements) {
  if (!xml.includes(from)) {
    console.warn(`Warning: placeholder source not found: ${from}`);
  }
  xml = xml.split(from).join(to);
}

const companyPattern =
  /<w:t xml:space="preserve">Ami <\/w:t><\/w:r><w:r[^>]*><w:rPr>[\s\S]*?<\/w:rPr><w:t>Pharma<\/w:t>/g;
if (companyPattern.test(xml)) {
  xml = xml.replace(companyPattern, '<w:t>{{COMPANY_NAME}}</w:t>');
} else {
  console.warn('Warning: split company name pattern not found');
}

const casPattern =
  /<w:t>147-14-<\/w:t><\/w:r><w:r[^>]*><w:rPr>[\s\S]*?<\/w:rPr><w:t>8<\/w:t>/g;
if (casPattern.test(xml)) {
  xml = xml.replace(casPattern, '<w:t>{{CAS_NUMBER}}</w:t>');
} else {
  console.warn('Warning: split CAS pattern not found');
}

const ecPattern =
  /<w:t>205-685-<\/w:t><\/w:r><w:r[^>]*><w:rPr>[\s\S]*?<\/w:rPr><w:t>1<\/w:t>/g;
if (ecPattern.test(xml)) {
  xml = xml.replace(ecPattern, '<w:t>{{EC_NUMBER}}</w:t>');
} else {
  console.warn('Warning: split EC pattern not found');
}

const uuidPattern =
  /<w:t>ECHA-ac4a5f61-f070-4d66-9703-<\/w:t><\/w:r><w:r[^>]*><w:rPr>[\s\S]*?<\/w:rPr><w:t>96b2190cb5ba<\/w:t>/g;
if (uuidPattern.test(xml)) {
  xml = xml.replace(uuidPattern, '<w:t>{{UUID_NUMBER}}</w:t>');
} else {
  console.warn('Warning: split UUID pattern not found');
}

const chemicalPattern =
  /<w:t xml:space="preserve">29H,31H-phthalocyaninato\(2-\)-N29,N30,N31,N32 <\/w:t><\/w:r><w:r[^>]*><w:rPr>[\s\S]*?<\/w:rPr><w:t>copper<\/w:t>/g;
if (chemicalPattern.test(xml)) {
  xml = xml.replace(chemicalPattern, '<w:t>{{CHEMICAL_NAME}}</w:t>');
} else {
  console.warn('Warning: split chemical name pattern not found');
}

const tonnagePattern =
  /<w:t xml:space="preserve">10–100 <\/w:t><\/w:r><w:r[^>]*><w:rPr>[\s\S]*?<\/w:rPr><w:t>tpa<\/w:t>/g;
if (tonnagePattern.test(xml)) {
  xml = xml.replace(tonnagePattern, '<w:t>{{TONNAGE_BAND}}</w:t>');
} else {
  console.warn('Warning: split tonnage pattern not found');
}

if (xml.includes('>India<')) {
  xml = xml.split('>India<').join('>{{ADDR_LINE3}}<');
}

const placeholders = [
  '{{COMPANY_NAME}}',
  '{{ADDR_LINE1}}',
  '{{ADDR_LINE3}}',
  '{{CHEMICAL_NAME}}',
  '{{CAS_NUMBER}}',
  '{{EC_NUMBER}}',
  '{{TONNAGE_BAND}}',
  '{{REGISTRATION_NUMBER}}',
  '{{UUID_NUMBER}}',
  '{{ISSUED_DATE}}',
  '{{VALIDATED_DATE}}',
];

for (const ph of placeholders) {
  if (!xml.includes(ph)) {
    console.warn(`Warning: missing placeholder in output: ${ph}`);
  }
}

const drawings = (xml.match(/<w:drawing>/g) || []).length;
const tblp = (xml.match(/<w:tblpPr/g) || []).length;
console.log(`Layout preserved: drawings=${drawings}, floatingTables=${tblp}`);

fs.mkdirSync(path.dirname(target), { recursive: true });

zip.file('word/document.xml', xml);
fs.writeFileSync(target, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log(`Runtime template written to ${target}`);
console.log('Run: node scripts/generate-eu-reach-preview-pdf.mjs');
