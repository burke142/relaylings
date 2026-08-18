import { assertSafeJob, parseReceipt } from '../jobPacket';
import type { AgentAdapter, AgentJob, AgentJobReceipt, ProviderId } from '../types';

type RemoteProviderId = Exclude<ProviderId, 'simulation'>;
type FetchLike = typeof fetch;

export interface ProxyAdapterOptions {
  provider: RemoteProviderId;
  endpoint?: string;
  fetcher?: FetchLike;
}

export class ProxyAdapter implements AgentAdapter {
  readonly id: RemoteProviderId;
  readonly label: string;
  private readonly endpoint: string;
  private readonly fetcher: FetchLike;

  constructor(options: ProxyAdapterOptions) {
    this.id = options.provider;
    this.label = options.provider === 'openrouter' ? 'OpenRouter helper' : `${title(options.provider)} CLI`;
    this.endpoint = options.endpoint ?? '/api/agent/run';
    this.fetcher = options.fetcher ?? fetch;
  }

  async execute(job: AgentJob, signal: AbortSignal): Promise<AgentJobReceipt> {
    assertSafeJob(job);
    const response = await this.fetcher(this.endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Idempotency-Key': job.id,
      },
      body: JSON.stringify({ provider: this.id, job }),
      credentials: 'same-origin',
      signal,
    });
    const body = await readJson(response);
    if (!response.ok) {
      const message = isRecord(body) && typeof body.error === 'string'
        ? body.error
        : `Helper bridge failed (${response.status}).`;
      throw new Error(message);
    }
    return parseReceipt(body, this.id);
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error('Helper bridge returned invalid JSON.');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function title(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
