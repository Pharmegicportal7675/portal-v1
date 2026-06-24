import { isLibreOfficeInstalled } from '@/services/reach-certificate-docx';
import {
  isReachPuppeteerPdfAvailable,
  resolveSystemChromeExecutable,
} from '@/services/reach-certificate-puppeteer-pdf';
import { resolvePdfRenderBaseUrl } from '@/lib/reach-pdf-render-url';

export type ReachPdfConverterStatus = {
  /** RC certificates: HTML → PDF via Puppeteer/Chromium */
  htmlPdfEnabled: boolean;
  htmlPdfRenderUrl: string | null;
  systemChromeFound: boolean;
  /** TCC / legacy DOCX routes: LibreOffice on VPS only */
  docxPdfAvailable: boolean;
  libreOfficeInstalled: boolean;
  platform: string;
  hosting: 'hostinger' | 'local';
  recommendedAction: string | null;
};

export async function resolveReachPdfConverterStatus(): Promise<ReachPdfConverterStatus> {
  const libreOfficeInstalled = isLibreOfficeInstalled();
  const hosting =
    process.platform === 'linux' && process.env.NODE_ENV === 'production' ? 'hostinger' : 'local';
  const htmlPdfEnabled = isReachPuppeteerPdfAvailable();
  const systemChromeFound = Boolean(await resolveSystemChromeExecutable());

  let htmlPdfRenderUrl: string | null = null;
  if (htmlPdfEnabled) {
    try {
      htmlPdfRenderUrl = resolvePdfRenderBaseUrl();
    } catch {
      htmlPdfRenderUrl = null;
    }
  }

  let recommendedAction: string | null = null;
  if (htmlPdfEnabled && !htmlPdfRenderUrl) {
    recommendedAction =
      'Set NEXT_PUBLIC_APP_URL in Hostinger environment variables (e.g. https://portal.pharmegichealthcare.com), then redeploy.';
  } else if (htmlPdfEnabled && hosting === 'hostinger' && !systemChromeFound) {
    recommendedAction =
      'Install Google Chrome on the Hostinger VPS and set PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable';
  }

  return {
    htmlPdfEnabled,
    htmlPdfRenderUrl,
    systemChromeFound,
    docxPdfAvailable: libreOfficeInstalled,
    libreOfficeInstalled,
    platform: process.platform,
    hosting,
    recommendedAction,
  };
}
