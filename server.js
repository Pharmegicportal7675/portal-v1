// Hostinger entry — matches Pharmegic-1 reference (npx next start, bind 0.0.0.0)
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

console.info('[portal] PORT:', port);
console.info('[portal] DATABASE_URL:', process.env.DATABASE_URL ? 'set' : 'MISSING');
console.info(`[portal] Starting Next.js on 0.0.0.0:${port}`);

spawn('npx', ['next', 'start', '-H', '0.0.0.0', '-p', String(port)], {
  stdio: 'inherit',
  shell: true,
  cwd: __dirname,
  env: process.env,
}).on('exit', (code) => process.exit(code ?? 1));
