import { isLibreOfficeInstalled } from '@/services/reach-certificate-docx';
import { isVercelHosting } from '@/lib/hosting';
import {
  isReachPuppeteerPdfAvailable,
  resolveSystemChromeExecutable,
  usesBundledChromiumFallback,
  usesServerlessChromium,
} from '@/services/reach-certificate-puppeteer-pdf';
import { resolvePdfRenderBaseUrl } from '@/lib/reach-pdf-render-url';

export type ReachPdfConverterStatus = {
  /** RC certificates: HTML → PDF via Puppeteer/Chromium */
  htmlPdfEnabled: boolean;
  htmlPdfRenderUrl: string | null;
  htmlPdfUsesServerlessChromium: boolean;
  htmlPdfUsesBundledChromiumFallback: boolean;
  systemChromeFound: boolean;
  /** TCC / legacy DOCX routes: LibreOffice on VPS only */
  docxPdfAvailable: boolean;
  libreOfficeInstalled: boolean;
  platform: string;
  hosting: 'vercel' | 'vps' | 'local';
  recommendedAction: string | null;
};

export async function resolveReachPdfConverterStatus(): Promise<ReachPdfConverterStatus> {
  const libreOfficeInstalled = isLibreOfficeInstalled();
  const hosting = isVercelHosting() ? 'vercel' : process.platform === 'linux' ? 'vps' : 'local';
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
    hosting === 'vps' &&
    !systemChromeFound &&
    htmlPdfUsesBundledChromiumFallback
  ) {
    recommendedAction =
      'No system Chrome found — PDF generation uses bundled Chromium (first request may take ~30s). Optional: install Google Chrome and set PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable';
  }

  return {
    htmlPdfEnabled,
    htmlPdfRenderUrl,
    htmlPdfUsesServerlessChromium: usesServerlessChromium(),
    htmlPdfUsesBundledChromiumFallback,
    systemChromeFound,
    docxPdfAvailable: libreOfficeInstalled,
    libreOfficeInstalled,
    platform: process.platform,
    hosting,
    recommendedAction,
  };
}
