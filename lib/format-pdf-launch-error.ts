const HOSTINGER_CHROME_HINT =
  'Hostinger process limit reached (EAGAIN). Install Google Chrome via SSH and set PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable — see deployment.md. Avoid concurrent PDF downloads.';

export function formatPdfLaunchError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (lower.includes('eagain') || lower.includes('spawn /tmp/chromium')) {
    return new Error(`${message}\n\n${HOSTINGER_CHROME_HINT}`);
  }

  if (lower.includes('failed to launch the browser process')) {
    return new Error(`${message}\n\n${HOSTINGER_CHROME_HINT}`);
  }

  return err instanceof Error ? err : new Error(message);
}
