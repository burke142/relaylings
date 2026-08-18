import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

if (!existsSync('.env')) {
  process.stderr.write('Create a local .env from .env.example before starting connected helpers.\n');
  process.exit(1);
}

const env = {
  ...process.env,
  RELAYLINGS_BRIDGE_TOKEN: randomBytes(32).toString('hex'),
};
const children = [
  spawn(process.execPath, ['--env-file=.env', 'server/index.mjs'], { env, stdio: 'inherit', shell: false }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { env, stdio: 'inherit', shell: false }),
];
let stopping = false;

function stop(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill(signal);
}

for (const child of children) {
  child.on('exit', (code) => {
    if (!stopping) {
      process.exitCode = code || 0;
      stop();
    }
  });
  child.on('error', (error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    stop();
  });
}
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
