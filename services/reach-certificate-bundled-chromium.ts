import type { Browser } from 'puppeteer-core';
import { getBundledChromiumLaunchArgs } from '@/lib/chromium-launch-args';
import { ensureChromiumRuntimeDir } from '@/lib/chromium-runtime-dir';
import { formatPdfLaunchError } from '@/lib/format-pdf-launch-error';
import { getBundledChromiumPackUrl } from '@/lib/bundled-chromium-config';
import {
  loadBundledChromiumModule,
  loadPuppeteerCore,
  resolvePuppeteerProjectRoot,
} from '@/lib/puppeteer-runtime';
import { resolveBundledChromiumExecutable } from '@/lib/bundled-chromium-executable';

async function resolveBundledExecutablePath(): Promise<string> {
  ensureChromiumRuntimeDir();
  const chromium = loadBundledChromiumModule();
  const packUrl = getBundledChromiumPackUrl();

  try {
    chromium.setGraphicsMode = false;
  } catch {
    // optional — reduces RAM on shared hosting
  }

  return resolveBundledChromiumExecutable(chromium, packUrl, resolvePuppeteerProjectRoot());
}

/** Launch Puppeteer using @sparticuz/chromium-min when system Chrome is unavailable. */
export async function launchBundledChromiumBrowser(): Promise<Browser> {
  ensureChromiumRuntimeDir();
  const puppeteer = loadPuppeteerCore();
  const chromium = loadBundledChromiumModule();

  try {
    const executablePath = await resolveBundledExecutablePath();
    return await puppeteer.launch({
      args: getBundledChromiumLaunchArgs(chromium.args),
      executablePath,
      headless: true,
      pipe: true,
    });
  } catch (err) {
    throw formatPdfLaunchError(err);
  }
}
