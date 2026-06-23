// Hostinger entry — binds to platform PORT (see HOSTINGER_SETUP.txt)
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const port = Number(process.env.PORT || 3000);

require('child_process')
  .spawn('npx', ['next', 'start', '-p', String(port)], {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  })
  .on('exit', (code) => process.exit(code ?? 1));
