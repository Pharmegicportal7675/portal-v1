/** @type {import('next').NextConfig} */
const PDF_FONT_TRACE = ['./public/fonts/**'];

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium-min'],
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
  outputFileTracingIncludes: {
    '/api/reach-certificate/pdf-html': [
      './node_modules/@sparticuz/chromium-min/**',
      ...PDF_FONT_TRACE,
    ],
    '/api/tcc-certificate/pdf-html': [
      './node_modules/@sparticuz/chromium-min/**',
      ...PDF_FONT_TRACE,
    ],
    '/api/tcc-certificate/html-data': PDF_FONT_TRACE,
  },
};

module.exports = nextConfig;
