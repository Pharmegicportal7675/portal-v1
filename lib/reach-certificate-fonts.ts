import fs from 'node:fs';
import path from 'node:path';

type FontFormat = 'truetype' | 'woff2';

type ReachCertificateFont = {
  family: string;
  file: string;
  weight: number;
  style: 'normal' | 'italic';
  format: FontFormat;
};

const PUBLIC_FONTS_DIR = path.join(process.cwd(), 'public', 'fonts');

const REACH_CERTIFICATE_FONTS: ReachCertificateFont[] = [
  { family: 'Verdana', file: 'verdana.ttf', weight: 400, style: 'normal', format: 'truetype' },
  { family: 'Verdana', file: 'verdanab.ttf', weight: 700, style: 'normal', format: 'truetype' },
  { family: 'Verdana', file: 'verdanai.ttf', weight: 400, style: 'italic', format: 'truetype' },
  { family: 'Verdana', file: 'verdanaz.ttf', weight: 700, style: 'italic', format: 'truetype' },
  {
    family: 'Times New Roman',
    file: 'Times-New-Roman.ttf',
    weight: 400,
    style: 'normal',
    format: 'truetype',
  },
  {
    family: 'Times New Roman',
    file: 'Times-New-Roman-Bold.ttf',
    weight: 700,
    style: 'normal',
    format: 'truetype',
  },
  {
    family: 'Times New Roman',
    file: 'Times-New-Roman-Italic.ttf',
    weight: 400,
    style: 'italic',
    format: 'truetype',
  },
  {
    family: 'Times New Roman',
    file: 'Times-New-Roman-BoldItalic.ttf',
    weight: 700,
    style: 'italic',
    format: 'truetype',
  },
  { family: 'Arial', file: 'arial.ttf', weight: 400, style: 'normal', format: 'truetype' },
  { family: 'Arial', file: 'arialbd.ttf', weight: 700, style: 'normal', format: 'truetype' },
  { family: 'Arial', file: 'ariali.ttf', weight: 400, style: 'italic', format: 'truetype' },
  { family: 'Arial', file: 'arialbi.ttf', weight: 700, style: 'italic', format: 'truetype' },
];

let fontFileIndex: Map<string, string> | null = null;

function getFontFileIndex(): Map<string, string> {
  if (fontFileIndex) return fontFileIndex;

  fontFileIndex = new Map();
  if (!fs.existsSync(PUBLIC_FONTS_DIR)) {
    return fontFileIndex;
  }

  for (const entry of fs.readdirSync(PUBLIC_FONTS_DIR)) {
    fontFileIndex.set(entry.toLowerCase(), entry);
  }

  return fontFileIndex;
}

/** Resolve font path on case-sensitive Linux hosts (Hostinger). */
export function resolveReachCertificateFontFile(file: string): string {
  const index = getFontFileIndex();
  const actualName = index.get(file.toLowerCase());

  if (!actualName) {
    throw new Error(
      `Font file not found: ${file}. Expected in ${PUBLIC_FONTS_DIR}. ` +
        `Available: ${[...index.values()].join(', ') || 'none'}`
    );
  }

  return path.join(PUBLIC_FONTS_DIR, actualName);
}

/** Public URL with exact on-disk casing for /fonts static serving. */
export function reachCertificateFontPublicUrl(file: string): string {
  const index = getFontFileIndex();
  const actualName = index.get(file.toLowerCase()) ?? file;
  return `/fonts/${actualName}`;
}

function fontMimeType(format: FontFormat): string {
  return format === 'woff2' ? 'font/woff2' : 'font/ttf';
}

function toFontDataUrl(font: ReachCertificateFont): string {
  const buffer = fs.readFileSync(resolveReachCertificateFontFile(font.file));
  return `data:${fontMimeType(font.format)};base64,${buffer.toString('base64')}`;
}

function buildFontFaceBlock(font: ReachCertificateFont, src: string): string {
  return `@font-face {
  font-family: '${font.family}';
  src: url('${src}') format('${font.format}');
  font-weight: ${font.weight};
  font-style: ${font.style};
  font-display: swap;
}`;
}

/** Inline @font-face rules with base64 data URLs — for Puppeteer setContent (no HTTP server). */
export function buildReachCertificateEmbeddedFontCss(): string {
  return REACH_CERTIFICATE_FONTS.map((font) =>
    buildFontFaceBlock(font, toFontDataUrl(font))
  ).join('\n');
}

/** Public URL paths — for browser preview and print pages served by Next.js. */
export function buildReachCertificatePublicFontCss(): string {
  return REACH_CERTIFICATE_FONTS.map((font) =>
    buildFontFaceBlock(font, reachCertificateFontPublicUrl(font.file))
  ).join('\n');
}

export const REACH_CERTIFICATE_FONT_FILES = REACH_CERTIFICATE_FONTS.map((font) => font.file);
