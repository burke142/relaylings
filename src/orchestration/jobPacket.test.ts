import { describe, expect, it } from 'vitest';
import type { AgentJob } from './types';
import { JOB_PACKET_VERSION } from './types';
import { assertSafeJob, serializeJob } from './jobPacket';

function validJob(): AgentJob {
  return {
    version: JOB_PACKET_VERSION,
    id: 'mission:task:1',
    missionId: 'mission',
    goal: 'Draft a checklist',
    task: { id: 'task', title: 'Draft', plain: 'Make the first draft.', preferredRole: 'runner' },
    assignee: { id: 'agent', name: 'Nova', role: 'runner' },
    attempt: 1,
    context: [],
    limits: { timeoutMs: 5_000, maxOutputChars: 2_000 },
  };
}

describe('job packets', () => {
  it('serializes a valid inspectable packet', () => {
    const text = serializeJob(validJob());
    expect(JSON.parse(text).goal).toBe('Draft a checklist');
  });

  it('refuses credential-like material', () => {
    const job = validJob();
    job.goal = 'Use OPENROUTER_API_KEY=secret-value';
    expect(() => assertSafeJob(job)).toThrow('must not contain credentials');
    job.goal = 'Log in with password=hunter2';
    expect(() => assertSafeJob(job)).toThrow('must not contain credentials');
  });

  it('refuses path-shaped or oversized identifiers', () => {
    const job = validJob();
    job.id = '../../escape';
    expect(() => assertSafeJob(job)).toThrow('Invalid job id');
  });
});
