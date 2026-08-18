import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { createCliProvider } from './providers/cli.mjs';
import { createOpenRouterProvider } from './providers/openrouter.mjs';

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

test('OpenRouter uses a server-only key and records observed cost', async () => {
  const calls = [];
  const settlements = [];
  const ledger = {
    reserve: (id) => calls.push(['reserve', id]),
    settle: async (id, cost) => settlements.push([id, cost]),
    release: () => {},
  };
  const fetchImpl = async (_url, init) => {
    assert.equal(init.headers.Authorization, 'Bearer server-secret');
    assert.equal(String(init.body).includes('server-secret'), false);
    const request = JSON.parse(String(init.body));
    assert.equal(request.provider.max_price.request, 0);
    assert.ok(request.provider.max_price.prompt > 0);
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'Finished.' } }],
      usage: { prompt_tokens: 10, completion_tokens: 4, cost: 0.002 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const provider = createOpenRouterProvider({
    config: { key: 'server-secret', model: 'chosen/model', maxTokens: 500, maxCostPerCallUsd: 0.25, referer: 'http://127.0.0.1', appName: 'Relaylings' },
    ledger,
    fetchImpl,
  });
  const receipt = await provider.execute(job(), new AbortController().signal);
  assert.equal(receipt.status, 'completed');
  assert.equal(receipt.usage.costUsd, 0.002);
  assert.deepEqual(settlements, [[job().id, 0.002]]);
});

test('OpenRouter redacts provider secrets from failed receipts', async () => {
  const ledger = { reserve: () => {}, settle: async () => {}, release: () => {} };
  const fakeKey = ['sk-or-v1', 'abcdefghijklmnop'].join('-');
  const provider = createOpenRouterProvider({
    config: { key: 'server-secret', model: 'chosen/model', maxTokens: 500, maxCostPerCallUsd: 0.25, referer: 'http://127.0.0.1', appName: 'Relaylings' },
    ledger,
    fetchImpl: async () => new Response(JSON.stringify({ error: { message: `Bearer ${fakeKey}` } }), { status: 401 }),
  });
  const receipt = await provider.execute(job(), new AbortController().signal);
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.error.message.includes('sk-or-v1-'), false);
  assert.equal(receipt.error.retryable, false);
});

test('CLI providers pass job text on stdin, never in argv, with read-only permissions', async () => {
  let captured;
  const spawnImpl = (command, args, options) => {
    captured = { command, args, options, stdin: '' };
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.stdin.on('data', (chunk) => { captured.stdin += chunk.toString(); });
    child.kill = () => {};
    child.stdin.on('finish', () => {
      child.stdout.end('Concise result.');
      queueMicrotask(() => child.emit('close', 0));
    });
    return child;
  };
  const provider = createCliProvider({ id: 'codex', cwd: '/safe/repo', enabled: true, spawnImpl });
  const receipt = await provider.execute(job(), new AbortController().signal);
  assert.equal(receipt.status, 'completed');
  assert.equal(captured.command, 'codex');
  assert.equal(captured.args.includes('read-only'), true);
  assert.equal(captured.args.includes('shell_tool'), true);
  assert.equal(captured.args.includes('apps._default.enabled=false'), true);
  assert.equal(captured.args.some((arg) => arg.includes(job().goal)), false);
  assert.equal(captured.stdin.includes(job().goal), true);
  assert.equal(captured.options.shell, false);
  assert.equal(captured.options.detached, true);
  assert.equal('OPENROUTER_API_KEY' in captured.options.env, false);
});

test('CLI providers fail closed on Windows where process-tree isolation is unavailable', async () => {
  const provider = createCliProvider({
    id: 'codex',
    cwd: '/safe/empty-sandbox',
    enabled: true,
    platform: 'win32',
    spawnImpl: () => { throw new Error('must not spawn'); },
  });
  const receipt = await provider.execute(job(), new AbortController().signal);
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.error.code, 'unsupported');
});

test('CLI cancellation escalates to the whole process group after the child closes', async () => {
  const signals = [];
  let child;
  const spawnImpl = () => {
    child = new EventEmitter();
    child.pid = 12345;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = () => {};
    return child;
  };
  const terminateImpl = (_child, signal) => {
    signals.push(signal);
    if (signal === 'SIGTERM') queueMicrotask(() => child.emit('close', null));
  };
  const controller = new AbortController();
  const provider = createCliProvider({ id: 'codex', cwd: '/safe/empty-sandbox', enabled: true, spawnImpl, terminateImpl });
  const pending = provider.execute(job(), controller.signal);
  controller.abort();
  const receipt = await pending;
  assert.equal(receipt.status, 'failed');
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
});

test('Claude CLI keeps normal authentication while disabling tools, settings, and MCP', async () => {
  let capturedArgs;
  const spawnImpl = (_command, args) => {
    capturedArgs = args;
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = () => {};
    child.stdin.on('finish', () => {
      child.stdout.end('Done.');
      queueMicrotask(() => child.emit('close', 0));
    });
    return child;
  };
  const provider = createCliProvider({ id: 'claude', cwd: '/safe/empty-sandbox', enabled: true, spawnImpl });
  const receipt = await provider.execute(job(), new AbortController().signal);
  assert.equal(receipt.status, 'completed');
  assert.equal(capturedArgs.includes('--bare'), false);
  assert.equal(capturedArgs[capturedArgs.indexOf('--tools') + 1], '');
  assert.equal(capturedArgs.includes('--strict-mcp-config'), true);
  assert.equal(capturedArgs.includes('--setting-sources'), true);
});
