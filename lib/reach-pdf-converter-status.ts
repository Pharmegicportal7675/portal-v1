import {
  isReachPuppeteerPdfAvailable,
  resolveSystemChromeExecutable,
  usesBundledChromiumFallback,
} from '@/lib/reach-pdf-environment';
import { resolvePdfRenderBaseUrl } from '@/lib/reach-pdf-render-url';

export type ReachPdfConverterStatus = {
  /** RC + TCC certificates: HTML → PDF via Puppeteer/Chromium */
  pdfEngine: 'puppeteer-core + @sparticuz/chromium-min';
  htmlPdfEnabled: boolean;
  htmlPdfRenderUrl: string | null;
  systemChromeFound: boolean;
  htmlPdfUsesBundledChromiumFallback: boolean;
  platform: string;
  hosting: 'hostinger' | 'local';
  recommendedAction: string | null;
};

export async function resolveReachPdfConverterStatus(): Promise<ReachPdfConverterStatus> {
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
      'No system Chrome found — PDF uses bundled Chromium. Remove PUPPETEER_EXECUTABLE_PATH from env if Chrome is not installed. First PDF may take ~30s.';
  } else if (htmlPdfEnabled && hosting === 'hostinger' && !systemChromeFound) {
    recommendedAction =
      'Install Google Chrome or redeploy with @sparticuz/chromium-min bundled fallback enabled.';
  }

  return {
    pdfEngine: 'puppeteer-core + @sparticuz/chromium-min',
    htmlPdfEnabled,
    htmlPdfRenderUrl,
    systemChromeFound,
    htmlPdfUsesBundledChromiumFallback,
    platform: process.platform,
    hosting,
    recommendedAction,
  };
}
