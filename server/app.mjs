import { createRateLimiter, redactError, validateRequestBody } from './security.mjs';
import { timingSafeEqual } from 'node:crypto';

export function createApp({ config, providers, now = Date.now }) {
  const providerMap = new Map(providers.map((provider) => [provider.id, provider]));
  const allowRequest = createRateLimiter({ requestsPerMinute: config.requestsPerMinute, now });
  const cache = new Map();
  const inFlight = new Map();
  const activeControllers = new Set();

  const handle = async function handle(request, response) {
    setSecurityHeaders(response);
    if (config.bridgeToken && !secureEqual(request.headers?.['x-relaylings-token'], config.bridgeToken)) {
      return json(response, 401, { error: 'Helper bridge token is missing or invalid.' });
    }
    if (request.method === 'GET' && request.url === '/api/health') {
      return json(response, 200, { ok: true, localOnly: true, providers: [...providerMap.keys()] });
    }
    if (request.method !== 'POST' || request.url !== '/api/agent/run') return json(response, 404, { error: 'Not found.' });
    const ip = request.socket?.remoteAddress || 'local';
    if (!allowRequest(ip)) return json(response, 429, { error: 'Local request limit reached. Try again in a minute.' });
    if (!String(request.headers?.['content-type'] || '').toLowerCase().startsWith('application/json')) {
      return json(response, 415, { error: 'Content-Type must be application/json.' });
    }
    try {
      const body = validateRequestBody(await readJson(request, config.maxBodyBytes));
      const idempotencyKey = request.headers?.['idempotency-key'];
      if (idempotencyKey !== body.job.id) return json(response, 400, { error: 'Idempotency key must match the job id.' });
      const cacheKey = `${body.provider}:${body.job.id}`;
      sweepCache(cache, now());
      const cached = cache.get(cacheKey);
      if (cached && now() - cached.at < 60_000) return json(response, 200, cached.receipt);
      const provider = providerMap.get(body.provider);
      if (!provider) return json(response, 503, { error: 'That helper is not configured.' });
      const existing = inFlight.get(cacheKey);
      if (existing) return json(response, 200, await existing);
      const controller = new AbortController();
      activeControllers.add(controller);
      const clientGone = () => controller.abort(new Error('Client disconnected.'));
      const responseClosed = () => { if (!response.writableEnded) clientGone(); };
      request.once('aborted', clientGone);
      response.once('close', responseClosed);
      if (request.aborted || response.destroyed) clientGone();
      const timeoutMs = Math.min(body.job.limits.timeoutMs, config.timeoutMs);
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const execution = provider.execute(body.job, controller.signal);
      inFlight.set(cacheKey, execution);
      let receipt;
      try { receipt = await execution; }
      finally {
        clearTimeout(timer);
        request.removeListener('aborted', clientGone);
        response.removeListener('close', responseClosed);
        inFlight.delete(cacheKey);
        activeControllers.delete(controller);
      }
      if (receipt.status === 'completed') {
        cache.set(cacheKey, { at: now(), receipt });
        sweepCache(cache, now());
      }
      return json(response, 200, receipt);
    } catch (error) {
      const status = error?.code === 'invalid_request' || error?.code === 'body_too_large' ? 400 : 500;
      return json(response, status, { error: redactError(error) });
    }
  };
  handle.abortAll = () => {
    for (const controller of activeControllers) {
      controller.abort(new Error('Helper bridge is shutting down.'));
    }
  };
  return handle;
}

function sweepCache(cache, time) {
  for (const [key, entry] of cache) if (time - entry.at >= 60_000) cache.delete(key);
  while (cache.size > 1_000) cache.delete(cache.keys().next().value);
}

function secureEqual(value, expected) {
  if (typeof value !== 'string') return false;
  const left = Buffer.from(value);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function readJson(request, maxBytes) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error('Request body is too large.');
      error.code = 'body_too_large';
      throw error;
    }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { const error = new Error('Request body is not valid JSON.'); error.code = 'invalid_request'; throw error; }
}

function setSecurityHeaders(response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Security-Policy', "default-src 'none'");
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

function json(response, status, body) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}
