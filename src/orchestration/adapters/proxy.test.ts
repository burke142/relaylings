import { describe, expect, it, vi } from 'vitest';
import { createMission } from '../../runtime/mission';
import type { Agent } from '../../runtime/types';
import { ProxyAdapter } from './proxy';
import { JOB_PACKET_VERSION, type AgentJob } from '../types';

const agent: Agent = { id: 'a1', name: 'Nova', role: 'runner', hue: 10, eyeStyle: 'wide' };

function job(): AgentJob {
  const task = createMission({ goal: 'test bridge', agents: [agent] }).tasks[0];
  return {
    version: JOB_PACKET_VERSION,
    id: 'mission-1:task-1:1',
    missionId: 'mission-1',
    goal: 'test bridge',
    task: { id: 'task-1', title: task.title, plain: task.plain, preferredRole: task.preferredRole },
    assignee: { id: agent.id, name: agent.name, role: agent.role },
    attempt: 1,
    context: [],
    limits: { timeoutMs: 5_000, maxOutputChars: 2_000 },
  };
}

describe('ProxyAdapter', () => {
  it('sends a narrow packet without a browser authorization header', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).has('Authorization')).toBe(false);
      expect(JSON.parse(String(init?.body))).toEqual({ provider: 'openrouter', job: job() });
      return new Response(JSON.stringify({
        version: 1,
        jobId: job().id,
        provider: 'openrouter',
        status: 'completed',
        output: 'Done.',
        durationMs: 4,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const adapter = new ProxyAdapter({ provider: 'openrouter', fetcher: fetcher as typeof fetch });
    const result = await adapter.execute(job(), new AbortController().signal);
    expect(result.output).toBe('Done.');
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('rejects a receipt from an unselected provider', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      version: 1,
      jobId: job().id,
      provider: 'claude',
      status: 'completed',
      output: 'Wrong helper.',
      durationMs: 1,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const adapter = new ProxyAdapter({ provider: 'codex', fetcher: fetcher as typeof fetch });
    await expect(adapter.execute(job(), new AbortController().signal)).rejects.toThrow('did not match');
  });
});
