import { spawn as nodeSpawn } from 'node:child_process';
import { redactError } from '../security.mjs';

const OUTPUT_CAP_BYTES = 256 * 1024;

export function createCliProvider({ id, cwd, enabled, spawnImpl = nodeSpawn, now = Date.now, platform = process.platform, terminateImpl = terminateTree }) {
  if (!['codex', 'claude'].includes(id)) throw new Error('Unsupported CLI provider.');
  return {
    id,
    async execute(job, signal) {
      if (!enabled) return failed(id, job.id, 'disabled', `${label(id)} CLI bridge is disabled.`, false);
      if (platform === 'win32') return failed(id, job.id, 'unsupported', 'CLI helpers are disabled on Windows until process-tree isolation is available.', false);
      const started = now();
      try {
        const output = await runProcess({ id, cwd, job, signal, spawnImpl, platform, terminateImpl });
        return {
          version: 1,
          jobId: job.id,
          provider: id,
          status: 'completed',
          output: output.slice(0, job.limits.maxOutputChars),
          durationMs: Math.max(0, now() - started),
        };
      } catch (error) {
        return failed(id, job.id, error?.code || 'cli_error', redactError(error), false, Math.max(0, now() - started));
      }
    },
  };
}

function runProcess({ id, cwd, job, signal, spawnImpl, platform, terminateImpl }) {
  const command = id === 'codex' ? 'codex' : 'claude';
  const args = id === 'codex'
    ? [
        'exec', '--ephemeral', '--ignore-user-config', '--ignore-rules',
        '--sandbox', 'read-only', '--color', 'never',
        '--disable', 'shell_tool', '--disable', 'unified_exec',
        '--disable', 'skill_mcp_dependency_install', '--disable', 'multi_agent',
        '-c', 'tools.web_search=false', '-c', 'tools.view_image=false',
        '-c', 'apps._default.enabled=false', '-',
      ]
    : [
        '-p', '--disable-slash-commands', '--no-session-persistence',
        '--permission-mode', 'plan', '--tools', '',
        '--setting-sources', '', '--strict-mcp-config',
        '--mcp-config', '{"mcpServers":{}}',
      ];
  const child = spawnImpl(command, args, {
    cwd,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: safeChildEnv(process.env),
    detached: true,
  });
  return new Promise((resolve, reject) => {
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let settled = false;
    let abortError;
    let forceTimer;
    let fallbackTimer;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      clearTimeout(forceTimer);
      clearTimeout(fallbackTimer);
      fn(value);
    };
    const abort = () => {
      if (abortError) return;
      abortError = new Error('CLI helper timed out or was cancelled.');
      abortError.code = 'timeout';
      terminateImpl(child, 'SIGTERM', platform);
      forceTimer = setTimeout(() => {
        terminateImpl(child, 'SIGKILL', platform);
        finish(reject, abortError);
      }, 750);
      fallbackTimer = setTimeout(() => finish(reject, abortError), 1_500);
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    child.stdout.on('data', (chunk) => {
      stdout = appendCapped(stdout, chunk);
      if (stdout.length >= OUTPUT_CAP_BYTES) abort();
    });
    child.stderr.on('data', (chunk) => { stderr = appendCapped(stderr, chunk); });
    child.on('error', (error) => { if (!abortError) finish(reject, error); });
    child.on('close', (code) => {
      if (abortError) return;
      if (code === 0) finish(resolve, stdout.toString('utf8').trim());
      else finish(reject, new Error(`${label(id)} CLI exited ${code}: ${stderr.toString('utf8').slice(0, 300)}`));
    });
    child.stdin.end(promptFor(job));
  });
}

function terminateTree(child, signal, platform) {
  try {
    if (platform !== 'win32' && Number.isInteger(child.pid)) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch {
    try { child.kill(signal); } catch { /* process already stopped */ }
  }
}

function promptFor(job) {
  const context = job.context.length ? `\nEarlier work:\n${job.context.map((item) => `- ${item.summary}`).join('\n')}` : '';
  return `You are ${job.assignee.name}, the ${job.assignee.role} in Relaylings.\nGoal: ${job.goal}\nDo only this bounded task: ${job.task.title}\n${job.task.plain}${context}\nReturn a concise result and clearly state any blocker.`;
}

function safeChildEnv(env) {
  const allowed = ['HOME', 'PATH', 'LANG', 'LC_ALL', 'SHELL', 'TERM', 'TMPDIR', 'USER', 'CODEX_HOME'];
  return Object.fromEntries(allowed.filter((key) => typeof env[key] === 'string').map((key) => [key, env[key]]));
}

function appendCapped(current, chunk) {
  const next = Buffer.concat([current, Buffer.from(chunk)]);
  return next.subarray(0, OUTPUT_CAP_BYTES);
}

function label(id) { return id === 'codex' ? 'Codex' : 'Claude'; }

function failed(provider, jobId, code, message, retryable, durationMs = 0) {
  return { version: 1, jobId, provider, status: 'failed', error: { code, message, retryable }, durationMs };
}
