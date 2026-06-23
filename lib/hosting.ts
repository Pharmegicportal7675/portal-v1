/** True when running on Vercel serverless (unused on Hostinger production). */
export function isVercelHosting(): boolean {
  return process.env.VERCEL === '1' || Boolean(process.env.VERCEL_URL);
}
