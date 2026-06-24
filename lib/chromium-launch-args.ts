/** Chromium flags for bundled @sparticuz/chromium-min on shared hosting. */
export function getBundledChromiumLaunchArgs(baseArgs: string[] = []): string[] {
  const extra = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-breakpad',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-hang-monitor',
    '--disable-popup-blocking',
    '--disable-prompt-on-repost',
    '--disable-sync',
    '--metrics-recording-only',
    '--no-first-run',
    '--renderer-process-limit=2',
  ];

  const merged = [...baseArgs];
  for (const arg of extra) {
    if (!merged.includes(arg)) merged.push(arg);
  }
  return merged.filter((arg) => arg !== '--single-process' && arg !== '--no-zygote');
}

/** System Chrome — stable flags for VPS / Hostinger. */
export function getSystemChromeLaunchArgs(extra: string[] = []): string[] {
  return [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--renderer-process-limit=2',
    ...extra,
  ];
}

/** @deprecated Use getBundledChromiumLaunchArgs or getSystemChromeLaunchArgs */
export function getSharedHostingChromiumArgs(baseArgs: string[] = []): string[] {
  return getBundledChromiumLaunchArgs(baseArgs);
}
