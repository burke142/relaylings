import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createApp } from './app.mjs';

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

async function withServer(provider, run, overrides = {}) {
  const config = { requestsPerMinute: 10, maxBodyBytes: 32_768, timeoutMs: 5_000, ...overrides };
  const server = createServer(createApp({ config, providers: provider ? [provider] : [] }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('configured bridge token protects health and work routes', async () => {
  const token = 'a'.repeat(32);
  await withServer(null, async (base) => {
    assert.equal((await fetch(`${base}/api/health`)).status, 401);
    assert.equal((await fetch(`${base}/api/health`, { headers: { 'X-Relaylings-Token': token } })).status, 200);
  }, { bridgeToken: token });
});

test('health is honest when no providers are configured', async () => {
  await withServer(null, async (base) => {
    const response = await fetch(`${base}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).providers, []);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('content-security-policy'), "default-src 'none'");
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()');
  });
});

test('run endpoint requires strict JSON and an idempotency key', async () => {
  await withServer(null, async (base) => {
    const response = await fetch(`${base}/api/agent/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'openrouter', job: job() }),
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /Idempotency/);
  });
});

test('completed jobs are deduplicated for sixty seconds', async () => {
  let calls = 0;
  const provider = {
    id: 'openrouter',
    execute: async (packet) => {
      calls += 1;
      return { version: 1, jobId: packet.id, provider: 'openrouter', status: 'completed', output: 'Done.', durationMs: 1 };
    },
  };
  await withServer(provider, async (base) => {
    const init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': job().id },
      body: JSON.stringify({ provider: 'openrouter', job: job() }),
    };
    assert.equal((await fetch(`${base}/api/agent/run`, init)).status, 200);
    assert.equal((await fetch(`${base}/api/agent/run`, init)).status, 200);
    assert.equal(calls, 1);
  });
});

test('concurrent identical jobs share one provider execution', async () => {
  let calls = 0;
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const provider = {
    id: 'openrouter',
    execute: async (packet) => {
      calls += 1;
      await held;
      return { version: 1, jobId: packet.id, provider: 'openrouter', status: 'completed', output: 'Done.', durationMs: 1 };
    },
  };
  await withServer(provider, async (base) => {
    const init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': job().id },
      body: JSON.stringify({ provider: 'openrouter', job: job() }),
    };
    const first = fetch(`${base}/api/agent/run`, init);
    const second = fetch(`${base}/api/agent/run`, init);
    await new Promise((resolve) => setTimeout(resolve, 20));
    release();
    assert.equal((await first).status, 200);
    assert.equal((await second).status, 200);
    assert.equal(calls, 1);
  });
});

test('client disconnect aborts provider work', async () => {
  let providerAborted = false;
  const provider = {
    id: 'openrouter',
    execute: (packet, signal) => new Promise((resolve) => {
      signal.addEventListener('abort', () => {
        providerAborted = true;
        resolve({ version: 1, jobId: packet.id, provider: 'openrouter', status: 'failed', error: { code: 'cancelled', message: 'Cancelled.', retryable: false }, durationMs: 1 });
      }, { once: true });
    }),
  };
  await withServer(provider, async (base) => {
    const controller = new AbortController();
    const pending = fetch(`${base}/api/agent/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': job().id },
      body: JSON.stringify({ provider: 'openrouter', job: job() }),
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 20);
    await assert.rejects(pending, /abort/i);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(providerAborted, true);
  });
});

test('bridge shutdown aborts every active provider execution', async () => {
  let providerAborted = false;
  const provider = {
    id: 'claude',
    execute: (packet, signal) => new Promise((resolve) => {
      signal.addEventListener('abort', () => {
        providerAborted = true;
        resolve({ version: 1, jobId: packet.id, provider: 'claude', status: 'failed', error: { code: 'cancelled', message: 'Cancelled.', retryable: false }, durationMs: 1 });
      }, { once: true });
    }),
  };
  const config = { requestsPerMinute: 10, maxBodyBytes: 32_768, timeoutMs: 5_000 };
  const app = createApp({ config, providers: [provider] });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const pending = fetch(`http://127.0.0.1:${address.port}/api/agent/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': job().id },
    body: JSON.stringify({ provider: 'claude', job: job() }),
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  app.abortAll();
  const response = await pending;
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'failed');
  assert.equal(providerAborted, true);
  await new Promise((resolve) => server.close(resolve));
});
