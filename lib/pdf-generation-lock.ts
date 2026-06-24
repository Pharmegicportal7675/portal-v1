/** Serialize PDF generation on shared hosting — avoids Chromium fork storms (EAGAIN). */
let chain: Promise<void> = Promise.resolve();

export async function withPdfGenerationLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = chain;
  let release!: () => void;
  chain = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;

  try {
    return await fn();
  } finally {
    release();
  }
}
