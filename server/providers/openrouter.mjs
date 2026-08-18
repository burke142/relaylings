import { redactError } from '../security.mjs';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export function createOpenRouterProvider({ config, ledger, fetchImpl = fetch, now = Date.now }) {
  return {
    id: 'openrouter',
    async execute(job, signal) {
      if (!config.key || !config.model) return failed(job.id, 'not_configured', 'OpenRouter is not configured.', false);
      let reservationOpen = false;
      let requestStarted = false;
      const started = now();
      try {
        ledger.reserve(job.id);
        reservationOpen = true;
        const userContent = promptFor(job);
        const systemContent = 'Complete one bounded task. Return only a concise result; do not claim actions you did not perform.';
        const maxPricePerMillion = priceCeiling({
          prompt: `${systemContent}\n${userContent}`,
          maxTokens: config.maxTokens,
          maxCostUsd: config.maxCostPerCallUsd,
        });
        requestStarted = true;
        const response = await fetchImpl(OPENROUTER_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.key}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': config.referer,
            'X-Title': config.appName,
          },
          body: JSON.stringify({
            model: config.model,
            temperature: 0.2,
            max_tokens: config.maxTokens,
            provider: {
              sort: 'price',
              max_price: {
                prompt: maxPricePerMillion,
                completion: maxPricePerMillion,
                request: 0,
                image: 0,
                audio: 0,
              },
            },
            messages: [
              { role: 'system', content: systemContent },
              { role: 'user', content: userContent },
            ],
          }),
          signal,
        });
        const body = await safeJson(response);
        if (!response.ok) throw providerError(response.status, body);
        const output = body?.choices?.[0]?.message?.content;
        if (typeof output !== 'string' || !output.trim()) throw new Error('OpenRouter returned no usable output.');
        const observedCost = numeric(body?.usage?.cost);
        reservationOpen = false;
        await ledger.settle(job.id, observedCost, { provider: 'openrouter', model: config.model });
        return {
          version: 1,
          jobId: job.id,
          provider: 'openrouter',
          status: 'completed',
          output: output.slice(0, job.limits.maxOutputChars),
          durationMs: Math.max(0, now() - started),
          usage: {
            inputTokens: numeric(body?.usage?.prompt_tokens),
            outputTokens: numeric(body?.usage?.completion_tokens),
            costUsd: observedCost,
          },
        };
      } catch (error) {
        if (reservationOpen && requestStarted) {
          reservationOpen = false;
          await ledger.settle(job.id, undefined, { provider: 'openrouter', model: config.model, outcome: 'unknown-or-failed' });
        } else if (reservationOpen) {
          reservationOpen = false;
          ledger.release(job.id);
        }
        return failed(job.id, error?.code || 'provider_error', redactError(error), retryable(error), Math.max(0, now() - started));
      }
    },
  };
}

function promptFor(job) {
  const context = job.context.length
    ? `\nEarlier completed work:\n${job.context.map((item) => `- ${item.summary}`).join('\n')}`
    : '';
  return `Goal: ${job.goal}\nYour role: ${job.assignee.role}\nTask: ${job.task.title}\nInstructions: ${job.task.plain}${context}`;
}

async function safeJson(response) {
  try { return await response.json(); } catch { return null; }
}

function providerError(status, body) {
  const error = new Error(typeof body?.error?.message === 'string' ? body.error.message : `Provider returned ${status}.`);
  error.code = status === 401 || status === 403 ? 'auth' : status === 429 ? 'rate_limited' : 'provider_error';
  error.retryable = status === 429 || status >= 500;
  return error;
}

function retryable(error) {
  return Boolean(error?.retryable) || error?.name === 'AbortError';
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function priceCeiling({ prompt, maxTokens, maxCostUsd }) {
  if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0) throw new Error('A positive per-call spend cap is required.');
  const worstCaseTokens = Buffer.byteLength(prompt, 'utf8') + maxTokens + 256;
  return Math.floor((maxCostUsd * 1_000_000) / worstCaseTokens * 1_000_000) / 1_000_000;
}

function failed(jobId, code, message, canRetry, durationMs = 0) {
  return { version: 1, jobId, provider: 'openrouter', status: 'failed', error: { code, message, retryable: canRetry }, durationMs };
}
