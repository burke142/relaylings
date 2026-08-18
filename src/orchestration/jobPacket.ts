import { JOB_PACKET_VERSION, type AgentJob, type AgentJobReceipt, type ProviderId } from './types';

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/;
const CREDENTIAL_PATTERNS = [
  /sk-or-v1-[a-zA-Z0-9_-]{12,}/i,
  /(?:OPENROUTER_API_KEY|ANTHROPIC_API_KEY|OPENAI_API_KEY)\s*=/i,
  /authorization\s*:\s*bearer\s+\S+/i,
  /(?:password|token|secret|api[_-]?key)\s*[:=]\s*\S{4,}/i,
];

const PROVIDERS: ReadonlySet<ProviderId> = new Set([
  'simulation',
  'openrouter',
  'codex',
  'claude',
]);

export function assertSafeJob(job: AgentJob): void {
  if (job.version !== JOB_PACKET_VERSION) throw new Error('Unsupported job packet version.');
  for (const [name, value] of [
    ['job id', job.id],
    ['mission id', job.missionId],
    ['task id', job.task.id],
    ['agent id', job.assignee.id],
  ] as const) {
    if (!ID_PATTERN.test(value)) throw new Error(`Invalid ${name}.`);
  }
  if (!job.goal.trim() || job.goal.length > 4_000) throw new Error('Goal must be 1–4,000 characters.');
  if (!job.task.title.trim() || job.task.title.length > 1_000) throw new Error('Task title is invalid.');
  if (!job.task.plain.trim() || job.task.plain.length > 4_000) throw new Error('Task instructions are invalid.');
  if (!Number.isInteger(job.attempt) || job.attempt < 1 || job.attempt > 2) {
    throw new Error('Attempt must be 1 or 2.');
  }
  if (
    !Number.isInteger(job.limits.timeoutMs) ||
    job.limits.timeoutMs < 1_000 ||
    job.limits.timeoutMs > 120_000
  ) {
    throw new Error('Timeout is outside the allowed range.');
  }
  if (
    !Number.isInteger(job.limits.maxOutputChars) ||
    job.limits.maxOutputChars < 256 ||
    job.limits.maxOutputChars > 100_000
  ) {
    throw new Error('Output limit is outside the allowed range.');
  }
  if (job.context.length > 8) throw new Error('Too many context items.');
  const text = JSON.stringify(job);
  if (CREDENTIAL_PATTERNS.some((pattern) => pattern.test(text))) {
    throw new Error('Job packets must not contain credentials.');
  }
}

export function serializeJob(job: AgentJob): string {
  assertSafeJob(job);
  return `${JSON.stringify(job, null, 2)}\n`;
}

export function parseReceipt(value: unknown, expectedProvider?: ProviderId): AgentJobReceipt {
  if (!isRecord(value)) throw new Error('Provider returned a non-object receipt.');
  if (value.version !== JOB_PACKET_VERSION) throw new Error('Provider returned an unsupported receipt.');
  if (typeof value.jobId !== 'string' || !ID_PATTERN.test(value.jobId)) throw new Error('Provider returned an invalid job id.');
  if (typeof value.provider !== 'string' || !PROVIDERS.has(value.provider as ProviderId)) {
    throw new Error('Provider returned an invalid provider id.');
  }
  if (expectedProvider && value.provider !== expectedProvider) throw new Error('Provider receipt did not match the selected provider.');
  if (value.status !== 'completed' && value.status !== 'failed') throw new Error('Provider returned an invalid status.');
  if (!Number.isFinite(value.durationMs) || (value.durationMs as number) < 0) throw new Error('Provider returned an invalid duration.');
  if (value.status === 'completed' && typeof value.output !== 'string') throw new Error('Completed receipt has no output.');
  if (value.status === 'failed') {
    if (!isRecord(value.error) || typeof value.error.code !== 'string' || typeof value.error.message !== 'string' || typeof value.error.retryable !== 'boolean') {
      throw new Error('Failed receipt has no valid error.');
    }
  }
  return value as unknown as AgentJobReceipt;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
