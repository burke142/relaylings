const SENSITIVE = [
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /sk-or-v1-[A-Za-z0-9_-]+/gi,
  /(?:api[_-]?key|token|secret|password)\s*[=:]\s*[^\s,}]+/gi,
];

export function redactError(error) {
  let text = error instanceof Error ? error.message : String(error);
  for (const pattern of SENSITIVE) text = text.replace(pattern, '[redacted]');
  return text.slice(0, 240) || 'Helper bridge failed.';
}

export function createRateLimiter({ requestsPerMinute, now = Date.now }) {
  const buckets = new Map();
  return (key) => {
    const time = now();
    const recent = (buckets.get(key) || []).filter((stamp) => time - stamp < 60_000);
    if (recent.length >= requestsPerMinute) return false;
    recent.push(time);
    buckets.set(key, recent);
    return true;
  };
}

export function validateRequestBody(value) {
  if (!isPlainObject(value) || !hasOnly(value, ['provider', 'job'])) throw bad('Request must contain only provider and job.');
  if (!['openrouter', 'codex', 'claude'].includes(value.provider)) throw bad('Unknown helper provider.');
  validateJob(value.job);
  return value;
}

export function validateJob(job) {
  if (!isPlainObject(job) || !hasOnly(job, ['version', 'id', 'missionId', 'goal', 'task', 'assignee', 'attempt', 'context', 'limits'])) throw bad('Invalid job packet shape.');
  if (job.version !== 1) throw bad('Unsupported job packet version.');
  for (const value of [job.id, job.missionId]) if (!validId(value)) throw bad('Invalid job identifier.');
  if (typeof job.goal !== 'string' || !job.goal.trim() || job.goal.length > 4_000) throw bad('Invalid goal.');
  if (!isPlainObject(job.task) || !hasOnly(job.task, ['id', 'title', 'plain', 'preferredRole'])) throw bad('Invalid task.');
  if (!validId(job.task.id) || !boundedText(job.task.title, 1_000) || !boundedText(job.task.plain, 4_000)) throw bad('Invalid task content.');
  if (!['planner', 'runner', 'checker', 'helper'].includes(job.task.preferredRole)) throw bad('Invalid task role.');
  if (!isPlainObject(job.assignee) || !hasOnly(job.assignee, ['id', 'name', 'role'])) throw bad('Invalid assignee.');
  if (!validId(job.assignee.id) || !boundedText(job.assignee.name, 120) || !['planner', 'runner', 'checker', 'helper'].includes(job.assignee.role)) throw bad('Invalid assignee content.');
  if (![1, 2].includes(job.attempt)) throw bad('Invalid attempt.');
  if (!Array.isArray(job.context) || job.context.length > 8 || job.context.some((item) => !isPlainObject(item) || !hasOnly(item, ['taskId', 'summary']) || !validId(item.taskId) || !boundedText(item.summary, 1_500))) throw bad('Invalid context.');
  if (!isPlainObject(job.limits) || !hasOnly(job.limits, ['timeoutMs', 'maxOutputChars'])) throw bad('Invalid limits.');
  if (!Number.isInteger(job.limits.timeoutMs) || job.limits.timeoutMs < 1_000 || job.limits.timeoutMs > 120_000) throw bad('Invalid timeout.');
  if (!Number.isInteger(job.limits.maxOutputChars) || job.limits.maxOutputChars < 256 || job.limits.maxOutputChars > 100_000) throw bad('Invalid output limit.');
  const serialized = JSON.stringify(job);
  if (
    /sk-or-v1-[A-Za-z0-9_-]{12,}/i.test(serialized) ||
    /(?:OPENROUTER_API_KEY|ANTHROPIC_API_KEY|OPENAI_API_KEY)\s*=/i.test(serialized) ||
    /authorization\s*:\s*bearer/i.test(serialized) ||
    /(?:password|token|secret|api[_-]?key)\s*[:=]\s*\S{4,}/i.test(serialized)
  ) throw bad('Job packets must not contain credentials.');
  return job;
}

function bad(message) {
  const error = new Error(message);
  error.code = 'invalid_request';
  return error;
}

function validId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(value);
}

function boundedText(value, max) {
  return typeof value === 'string' && Boolean(value.trim()) && value.length <= max;
}

function hasOnly(value, keys) {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key)) && keys.every((key) => key in value);
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
