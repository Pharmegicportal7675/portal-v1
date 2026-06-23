/** @type {import('next').NextConfig} */
const PDF_FONT_TRACE = ['./public/fonts/**'];
const PRISMA_TRACE = ['./generated/prisma/**'];

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    'puppeteer-core',
    '@sparticuz/chromium-min',
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
    '/api/reach-certificate/pdf-html': [
      './node_modules/@sparticuz/chromium-min/**',
      ...PDF_FONT_TRACE,
      ...PRISMA_TRACE,
    ],
    '/api/tcc-certificate/pdf-html': [
      './node_modules/@sparticuz/chromium-min/**',
      ...PDF_FONT_TRACE,
      ...PRISMA_TRACE,
    ],
    '/api/tcc-certificate/html-data': [...PDF_FONT_TRACE, ...PRISMA_TRACE],
  },
};

module.exports = nextConfig;
