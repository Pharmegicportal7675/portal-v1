import {
  isLibreOfficeInstalled,
  isReachPuppeteerPdfAvailable,
  resolveSystemChromeExecutable,
  usesBundledChromiumFallback,
} from '@/lib/reach-pdf-environment';
import { resolvePdfRenderBaseUrl } from '@/lib/reach-pdf-render-url';

export type ReachPdfConverterStatus = {
  /** RC certificates: HTML → PDF via Puppeteer/Chromium */
  htmlPdfEnabled: boolean;
  htmlPdfRenderUrl: string | null;
  systemChromeFound: boolean;
  htmlPdfUsesBundledChromiumFallback: boolean;
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
  const htmlPdfUsesBundledChromiumFallback = usesBundledChromiumFallback();

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
  } else if (
    htmlPdfEnabled &&
    hosting === 'hostinger' &&
    !systemChromeFound &&
    htmlPdfUsesBundledChromiumFallback
  ) {
    recommendedAction =
      'No system Chrome found — PDF generation uses bundled Chromium (@sparticuz/chromium-min). First PDF may take ~30s. Optional: install Google Chrome and set PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable';
  } else if (htmlPdfEnabled && hosting === 'hostinger' && !systemChromeFound) {
    recommendedAction =
      'Install Google Chrome or redeploy with @sparticuz/chromium-min bundled fallback enabled.';
  }

  return {
    htmlPdfEnabled,
    htmlPdfRenderUrl,
    systemChromeFound,
    htmlPdfUsesBundledChromiumFallback,
    docxPdfAvailable: libreOfficeInstalled,
    libreOfficeInstalled,
    platform: process.platform,
    hosting,
    recommendedAction,
  };
}
