import fs from 'node:fs';

const LIBREOFFICE_PATHS = [
  '/usr/bin/soffice',
  '/usr/bin/libreoffice',
  '/snap/bin/libreoffice',
];

function chromeCandidates(): string[] {
  const fromEnv = [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_PATH].filter(
    (value): value is string => Boolean(value?.trim())
  );

  if (process.platform === 'win32') {
    return [
      ...fromEnv,
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ];
  }

  return [
    ...fromEnv,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ];
}

export function isReachPuppeteerPdfAvailable(): boolean {
  return process.env.REACH_PDF_DISABLED !== '1';
}

export function isLibreOfficeInstalled(): boolean {
  if (process.platform === 'win32') return true;
  return LIBREOFFICE_PATHS.some((bin) => fs.existsSync(bin));
}

export async function resolveSystemChromeExecutable(): Promise<string | null> {
  const { access } = await import('node:fs/promises');
  const { constants } = await import('node:fs');

  for (const candidate of chromeCandidates()) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // try next path
    }
  }

  return null;
}

export function usesBundledChromiumFallback(): boolean {
  return (
    process.env.REACH_PDF_USE_BUNDLED_CHROMIUM === '1' ||
    (process.platform === 'linux' && process.env.NODE_ENV === 'production')
  );
}
