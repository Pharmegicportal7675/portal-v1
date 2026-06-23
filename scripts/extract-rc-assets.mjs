import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';

const root = process.cwd();
const template = path.join(root, 'templates', 'EU_REACH_main.docx');
const outDir = path.join(root, 'public', 'certificate-assets');

fs.mkdirSync(outDir, { recursive: true });

const zip = new PizZip(fs.readFileSync(template));
for (const key of Object.keys(zip.files)) {
  if (!key.startsWith('word/media/') || key.endsWith('/')) continue;
  const name = path.basename(key);
  const target = path.join(outDir, name === 'image2.png' ? 'rc-seal.png' : 'rc-header-logo.png');
  fs.writeFileSync(target, zip.files[key].asNodeBuffer());
  console.log('wrote', target);
}
