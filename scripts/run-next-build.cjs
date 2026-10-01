const path = require('path');
const { spawnSync } = require('child_process');

const preload = path.resolve(__dirname, 'skip-user-profile-glob.cjs').replace(/\\/g, '/');
const existing = process.env.NODE_OPTIONS || '';
process.env.NODE_OPTIONS = [existing, `--require=${preload}`].filter(Boolean).join(' ');

const nextBin = path.resolve(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next');
const result = spawnSync(process.execPath, [nextBin, 'build', '--webpack'], {
  stdio: 'inherit',
  env: process.env,
  cwd: path.resolve(__dirname, '..'),
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status == null ? 1 : result.status);
