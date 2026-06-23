// Hostinger entry — binds 0.0.0.0 (never use process.env.HOSTNAME; Linux sets it to the machine name)
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const { spawn } = require('child_process');

function readPort() {
  const portFlagIndex = process.argv.indexOf('-p');
  if (portFlagIndex !== -1 && process.argv[portFlagIndex + 1]) {
    return process.argv[portFlagIndex + 1];
  }
  return process.env.PORT || '3000';
}

const port = readPort();

console.info(`[portal] Starting Next.js on 0.0.0.0:${port}`);

if (!process.env.DATABASE_URL) {
  console.warn('[portal] DATABASE_URL is not set — add it in hPanel environment variables.');
}

spawn('npx', ['next', 'start', '-H', '0.0.0.0', '-p', String(port)], {
  stdio: 'inherit',
  shell: true,
  cwd: __dirname,
  env: process.env,
}).on('exit', (code) => process.exit(code ?? 1));
