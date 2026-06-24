/** @type {import('next').NextConfig} */
const PDF_FONT_TRACE = ['./public/fonts/**'];
const PRISMA_TRACE = ['./generated/prisma/**'];
const CHROMIUM_TRACE = ['./node_modules/@sparticuz/chromium-min/**'];
const PUPPETEER_TRACE = ['./node_modules/puppeteer-core/**'];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: [
    '@prisma/client',
    'prisma',
    '@prisma/adapter-mariadb',
    'mariadb',
  ],
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/login',
        permanent: false,
      },
    ];
  },
  outputFileTracingIncludes: {
    '/api/health/db': PRISMA_TRACE,
    '/api/auth/login': PRISMA_TRACE,
    '/api/**/*': PRISMA_TRACE,
    '/admin/**/*': PRISMA_TRACE,
    '/client/**/*': PRISMA_TRACE,
    '/login': PRISMA_TRACE,
    '/api/tcc/application': PRISMA_TRACE,
    '/api/reach/certificates/bulk-email': PRISMA_TRACE,
    '/api/reach/certificates/delete': PRISMA_TRACE,
    '/api/reach/certificates/issue': PRISMA_TRACE,
    '/api/reach/certificates/update': PRISMA_TRACE,
    '/api/reach/certificates/send-email': PRISMA_TRACE,
    '/api/reach/certificates/resend-email': PRISMA_TRACE,
    '/api/client-chemicals/remove': PRISMA_TRACE,
    '/api/reach-certificate/pdf-html': [
      ...CHROMIUM_TRACE,
      ...PUPPETEER_TRACE,
      ...PDF_FONT_TRACE,
      ...PRISMA_TRACE,
    ],
    '/api/tcc-certificate/pdf-html': [
      ...CHROMIUM_TRACE,
      ...PUPPETEER_TRACE,
      ...PDF_FONT_TRACE,
      ...PRISMA_TRACE,
    ],
    '/api/tcc-certificate/html-data': [...PDF_FONT_TRACE, ...PRISMA_TRACE],
  },
};

module.exports = nextConfig;
