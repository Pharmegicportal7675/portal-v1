/** Chromium flags for bundled @sparticuz/chromium-min on shared hosting (low fork count). */
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
    '--disable-ipc-flooding-protection',
    '--disable-popup-blocking',
    '--disable-prompt-on-repost',
    '--disable-sync',
    '--metrics-recording-only',
    '--no-first-run',
    '--single-process',
    '--no-zygote',
  ];

  const merged = [...baseArgs];
  for (const arg of extra) {
    if (!merged.includes(arg)) merged.push(arg);
  }
  return merged;
}

/** System Chrome — stable flags without --single-process (better reliability). */
export function getSystemChromeLaunchArgs(extra: string[] = []): string[] {
  const base = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    ...extra,
  ];
  return base;
}

/** @deprecated Use getBundledChromiumLaunchArgs or getSystemChromeLaunchArgs */
export function getSharedHostingChromiumArgs(baseArgs: string[] = []): string[] {
  return getBundledChromiumLaunchArgs(baseArgs);
}
