import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from './config.mjs';
import { SpendLedger, readProjectLedgerSpend } from './ledger.mjs';
import { redactError, validateRequestBody } from './security.mjs';

function job() {
  return {
    version: 1,
    id: 'mission:task:1',
    missionId: 'mission',
    goal: 'Draft a list',
    task: { id: 'task', title: 'Draft', plain: 'Write a short draft.', preferredRole: 'runner' },
    assignee: { id: 'agent', name: 'Nova', role: 'runner' },
    attempt: 1,
    context: [],
    limits: { timeoutMs: 5_000, maxOutputChars: 2_000 },
  };
}

test('configuration refuses a remotely reachable bind', () => {
  assert.throws(() => loadConfig({ RELAYLINGS_HOST: '0.0.0.0' }), /loopback/);
});

test('configuration keeps session spend beneath the project ceiling', () => {
  assert.equal(loadConfig({}).spend.hardCapUsd, 5);
  assert.throws(() => loadConfig({ RELAYLINGS_HARD_CAP_USD: '400', RELAYLINGS_PRIOR_SPEND_USD: '399', RELAYLINGS_SESSION_CAP_USD: '2' }), /session spend cap/);
});

test('configured outside helpers require a long bridge token', () => {
  assert.throws(() => loadConfig({ OPENROUTER_API_KEY: 'server-only', OPENROUTER_MODEL: 'chosen/model' }), /bridge token/);
  const config = loadConfig({
    OPENROUTER_API_KEY: 'server-only',
    OPENROUTER_MODEL: 'chosen/model',
    RELAYLINGS_BRIDGE_TOKEN: 'a'.repeat(32),
  });
  assert.equal(config.bridgeToken.length, 32);
});

test('request validation is closed to extra fields and credentials', () => {
  assert.throws(() => validateRequestBody({ provider: 'openrouter', job: job(), extra: true }), /only provider and job/);
  const unsafe = job();
  unsafe.goal = 'Use OPENROUTER_API_KEY=not-safe';
  assert.throws(() => validateRequestBody({ provider: 'openrouter', job: unsafe }), /must not contain credentials/);
  unsafe.goal = 'Use password=hunter2';
  assert.throws(() => validateRequestBody({ provider: 'openrouter', job: unsafe }), /must not contain credentials/);
});

test('errors redact bearer tokens and key-shaped values', () => {
  const fakeKey = ['sk-or-v1', 'abcdefghijklmnop'].join('-');
  const message = redactError(new Error(`Authorization: Bearer ${fakeKey} api_key=abc123`));
  assert.equal(message.includes('sk-or-v1-'), false);
  assert.equal(message.includes('abc123'), false);
});

test('spend reservations stop before a session cap and settle honestly', async () => {
  const writes = [];
  const ledger = new SpendLedger({
    filePath: '/unused/ledger.jsonl',
    hardCapUsd: 400,
    priorSpendUsd: 10,
    sessionCapUsd: 0.5,
    maxCostPerCallUsd: 0.25,
    makeDir: async () => {},
    append: async (_path, text) => writes.push(text),
  });
  ledger.reserve('one');
  await ledger.settle('one', 0.1, { provider: 'openrouter' });
  ledger.reserve('two');
  assert.throws(() => ledger.reserve('three'), /spend cap/);
  assert.equal(ledger.snapshot().sessionSpendUsd, 0.1);
  assert.equal(writes.length, 1);
});

test('spend ledger reloads durable history before authorizing new calls', async () => {
  const prior = [
    JSON.stringify({ costUsd: 0.2 }),
    JSON.stringify({ costUsd: 0.15 }),
  ].join('\n');
  const ledger = await SpendLedger.open({
    filePath: '/unused/ledger.jsonl',
    hardCapUsd: 1,
    priorSpendUsd: 0.5,
    sessionCapUsd: 0.5,
    maxCostPerCallUsd: 0.2,
  }, { read: async () => prior });
  assert.equal(ledger.snapshot().historicalSpendUsd, 0.35);
  assert.throws(() => { ledger.reserve('one'); ledger.reserve('two'); }, /spend cap/);
});

test('project ledger contributes observed and conservative spend automatically', async () => {
  const markdown = [
    '- Observed spend so far: **$12.34 USD**',
    '- Conservatively unobserved/cancelled allowance so far: **$0.50 USD**',
  ].join('\n');
  assert.equal(await readProjectLedgerSpend('/unused.md', async () => markdown), 12.84);
});
