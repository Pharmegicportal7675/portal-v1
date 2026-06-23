import { isLibreOfficeInstalled } from '@/services/reach-certificate-docx';
import { isVercelHosting } from '@/lib/hosting';
import {
  isReachPuppeteerPdfAvailable,
  usesServerlessChromium,
} from '@/services/reach-certificate-puppeteer-pdf';
import { resolvePdfRenderBaseUrl } from '@/lib/reach-pdf-render-url';

export type ReachPdfConverterStatus = {
  /** RC certificates: HTML → PDF via Puppeteer/Chromium */
  htmlPdfEnabled: boolean;
  htmlPdfRenderUrl: string | null;
  htmlPdfUsesServerlessChromium: boolean;
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
      'Set NEXT_PUBLIC_APP_URL in Vercel Environment Variables (e.g. https://portal.pharmegichealthcare.com), then Redeploy.';
  }

  return {
    htmlPdfEnabled,
    htmlPdfRenderUrl,
    htmlPdfUsesServerlessChromium: usesServerlessChromium(),
    docxPdfAvailable: libreOfficeInstalled,
    libreOfficeInstalled,
    platform: process.platform,
    hosting,
    recommendedAction,
  };
}
