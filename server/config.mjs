const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

export function loadConfig(env = process.env, cwd = process.cwd()) {
  const host = env.RELAYLINGS_HOST || '127.0.0.1';
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error('The helper bridge is local-only and must bind to a loopback host.');
  }
  const port = boundedInteger(env.RELAYLINGS_PORT, 8787, 1, 65_535, 'port');
  const hardCapUsd = boundedNumber(env.RELAYLINGS_HARD_CAP_USD, 5, 0.01, 400, 'hard spend cap');
  const priorSpendUsd = boundedNumber(env.RELAYLINGS_PRIOR_SPEND_USD, 0, 0, hardCapUsd, 'prior spend');
  const remainingUsd = hardCapUsd - priorSpendUsd;
  if (remainingUsd <= 0) throw new Error('No authorized OpenRouter spend remains.');
  const sessionCapUsd = boundedNumber(env.RELAYLINGS_SESSION_CAP_USD, Math.min(5, remainingUsd), 0.01, remainingUsd, 'session spend cap');
  const maxCostPerCallUsd = boundedNumber(env.RELAYLINGS_MAX_COST_PER_CALL_USD, Math.min(0.25, sessionCapUsd), 0.001, sessionCapUsd, 'per-call spend cap');
  const openRouterKey = env.OPENROUTER_API_KEY || '';
  const openRouterModel = env.OPENROUTER_MODEL || '';
  const enableCli = env.ENABLE_CLI_BRIDGE === '1';
  if (Boolean(openRouterKey) !== Boolean(openRouterModel)) throw new Error('OpenRouter requires both a key and an explicit model.');
  const providersRequested = Boolean(openRouterKey && openRouterModel) || enableCli;
  const bridgeToken = env.RELAYLINGS_BRIDGE_TOKEN || '';
  if (providersRequested && bridgeToken.length < 32) throw new Error('Configured helpers require a bridge token of at least 32 characters.');

  return {
    host,
    port,
    cwd,
    timeoutMs: boundedInteger(env.RELAYLINGS_TIMEOUT_MS, 30_000, 1_000, 120_000, 'timeout'),
    maxBodyBytes: boundedInteger(env.RELAYLINGS_MAX_BODY_BYTES, 32_768, 1_024, 262_144, 'body size'),
    requestsPerMinute: boundedInteger(env.RELAYLINGS_REQUESTS_PER_MINUTE, 20, 1, 120, 'request rate'),
    enableCli,
    bridgeToken,
    openRouter: {
      key: openRouterKey,
      model: openRouterModel,
      maxTokens: boundedInteger(env.OPENROUTER_MAX_TOKENS, 1_000, 64, 4_000, 'OpenRouter token limit'),
      referer: env.OPENROUTER_SITE_URL || 'http://127.0.0.1',
      appName: env.OPENROUTER_APP_NAME || 'Relaylings local bridge',
    },
    spend: { hardCapUsd, priorSpendUsd, sessionCapUsd, maxCostPerCallUsd },
    projectLedgerPath: env.RELAYLINGS_PROJECT_LEDGER_PATH || '',
    ledgerPath: env.RELAYLINGS_LEDGER_PATH || `${cwd}/.relaylings/openrouter-ledger.jsonl`,
    cliSandboxPath: `${cwd}/.relaylings/cli-sandbox`,
  };
}

function boundedInteger(raw, fallback, min, max, label) {
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${label}.`);
  return value;
}

function boundedNumber(raw, fallback, min, max, label) {
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid ${label}.`);
  return value;
}
