// Hostinger entry — must bind 0.0.0.0 (see HOSTINGER_SETUP.txt)
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const { spawn } = require('child_process');
const path = require('path');

const port = process.env.PORT || '3000';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const nextBin = path.join(__dirname, 'node_modules', 'next', 'dist', 'bin', 'next');

const child = spawn(
  process.execPath,
  [nextBin, 'start', '-H', hostname, '-p', String(port)],
  { stdio: 'inherit', cwd: __dirname, env: process.env },
);

child.on('exit', (code) => process.exit(code ?? 1));
