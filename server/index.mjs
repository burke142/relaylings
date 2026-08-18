import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { createApp } from './app.mjs';
import { loadConfig } from './config.mjs';
import { SpendLedger, readProjectLedgerSpend } from './ledger.mjs';
import { createCliProvider } from './providers/cli.mjs';
import { createOpenRouterProvider } from './providers/openrouter.mjs';

const config = loadConfig();
const projectRecordedSpendUsd = config.projectLedgerPath
  ? await readProjectLedgerSpend(config.projectLedgerPath)
  : 0;
const ledger = await SpendLedger.open({
  filePath: config.ledgerPath,
  ...config.spend,
  priorSpendUsd: config.spend.priorSpendUsd + projectRecordedSpendUsd,
});
const providers = [];
if (config.openRouter.key && config.openRouter.model) {
  providers.push(createOpenRouterProvider({
    config: { ...config.openRouter, maxCostPerCallUsd: config.spend.maxCostPerCallUsd },
    ledger,
  }));
}
if (config.enableCli) {
  await mkdir(config.cliSandboxPath, { recursive: true, mode: 0o700 });
  providers.push(createCliProvider({ id: 'codex', cwd: config.cliSandboxPath, enabled: true }));
  providers.push(createCliProvider({ id: 'claude', cwd: config.cliSandboxPath, enabled: true }));
}

const app = createApp({ config, providers });
const server = createServer(app);
server.listen(config.port, config.host, () => {
  const names = providers.length ? providers.map((provider) => provider.id).join(', ') : 'none';
  process.stdout.write(`Relaylings helper bridge: http://${config.host}:${config.port} (providers: ${names})\n`);
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  app.abortAll();
  const force = setTimeout(() => process.exit(1), 2_000);
  force.unref();
  server.close(() => {
    clearTimeout(force);
    process.exit(0);
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
