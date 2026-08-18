import { describe, expect, it, vi } from 'vitest';
import type { Agent } from '../runtime/types';
import { createMission } from '../runtime/mission';
import { SimulationAdapter } from './adapters/simulation';
import { executeMission } from './orchestrator';
import { JOB_PACKET_VERSION, type AgentAdapter, type AgentJobReceipt } from './types';

const agents: Agent[] = [
  { id: 'planner', name: 'Nova', role: 'planner', hue: 30, eyeStyle: 'wide' },
  { id: 'runner', name: 'Dash', role: 'runner', hue: 140, eyeStyle: 'happy' },
  { id: 'checker', name: 'Prism', role: 'checker', hue: 240, eyeStyle: 'sparkle' },
  { id: 'helper', name: 'Mochi', role: 'helper', hue: 320, eyeStyle: 'sleepy' },
];

describe('executeMission', () => {
  it('completes every task through the deterministic adapter', async () => {
    const mission = createMission({ goal: 'plan a picnic', agents });
    const result = await executeMission(mission, new SimulationAdapter());
    expect(result.status).toBe('complete');
    expect(result.mission.tasks.every((task) => task.status === 'done')).toBe(true);
    expect(result.receipts).toHaveLength(mission.tasks.length);
    expect(result.events.at(-1)?.kind).toBe('mission-complete');
    expect(mission.status).toBe('draft');
  });

  it('hands a failed task to a different helper exactly once', async () => {
    let calls = 0;
    const adapter: AgentAdapter = {
      id: 'simulation',
      label: 'flaky helper',
      execute: vi.fn(async (job): Promise<AgentJobReceipt> => {
        calls += 1;
        if (calls === 1) throw new Error('Temporary stall.');
        return {
          version: JOB_PACKET_VERSION,
          jobId: job.id,
          provider: 'simulation',
          status: 'completed',
          output: 'Recovered.',
          durationMs: 1,
        };
      }),
    };
    const result = await executeMission(createMission({ goal: 'recover', agents }), adapter);
    expect(result.status).toBe('complete');
    const handoff = result.events.find((event) => event.kind === 'handoff');
    expect(handoff?.agentId).toBe('helper');
    expect(handoff?.fromAgentId).not.toBe(handoff?.agentId);
  });

  it('stops honestly after two failures', async () => {
    const adapter: AgentAdapter = {
      id: 'simulation',
      label: 'offline helper',
      execute: vi.fn(async () => { throw new Error('Offline.'); }),
    };
    const result = await executeMission(createMission({ goal: 'fail safely', agents }), adapter);
    expect(result.status).toBe('failed');
    expect(result.events.filter((event) => event.kind === 'stalled')).toHaveLength(2);
    expect(result.mission.tasks[0].status).toBe('stalled');
    expect(result.mission.destinationReached).toBe(false);
  });

  it('does not rescue a non-retryable provider failure', async () => {
    const adapter: AgentAdapter = {
      id: 'openrouter',
      label: 'paid helper',
      execute: vi.fn(async (job): Promise<AgentJobReceipt> => ({
        version: JOB_PACKET_VERSION,
        jobId: job.id,
        provider: 'openrouter',
        status: 'failed',
        error: { code: 'auth', message: 'Authentication failed.', retryable: false },
        durationMs: 1,
      })),
    };
    const result = await executeMission(createMission({ goal: 'fail once', agents }), adapter);
    expect(result.status).toBe('failed');
    expect(adapter.execute).toHaveBeenCalledTimes(1);
    expect(result.events.some((event) => event.kind === 'handoff')).toBe(false);
  });

  it('cancels before sending another job', async () => {
    const controller = new AbortController();
    controller.abort();
    const adapter = new SimulationAdapter();
    const execute = vi.spyOn(adapter, 'execute');
    const result = await executeMission(createMission({ goal: 'cancel', agents }), adapter, { signal: controller.signal });
    expect(result.status).toBe('cancelled');
    expect(execute).not.toHaveBeenCalled();
  });

  it('resumes after a checkpoint without rerunning completed tasks', async () => {
    const mission = createMission({ goal: 'resume safely', agents, seed: 91 });
    const first = mission.tasks[0];
    first.status = 'done';
    first.stepsRemaining = 0;
    first.assignedTo = agents[0].id;
    const receipt: AgentJobReceipt = {
      version: JOB_PACKET_VERSION,
      jobId: `${mission.id}:${first.id}:1`,
      provider: 'simulation',
      status: 'completed',
      output: 'Existing result.',
      durationMs: 1,
    };
    const adapter = new SimulationAdapter();
    const execute = vi.spyOn(adapter, 'execute');
    const result = await executeMission(mission, adapter, { initialReceipts: [receipt] });

    expect(result.status).toBe('complete');
    expect(execute).toHaveBeenCalledTimes(mission.tasks.length - 1);
    expect(result.receipts[0]).toEqual(receipt);
    expect(result.events.some((event) => event.taskId === first.id)).toBe(false);
  });

  it('marks active work stopped when cancellation happens mid-task', async () => {
    const controller = new AbortController();
    const adapter: AgentAdapter = {
      id: 'simulation',
      label: 'cancellable helper',
      execute: vi.fn(async () => {
        controller.abort();
        throw new Error('Cancelled.');
      }),
    };
    const result = await executeMission(createMission({ goal: 'stop honestly', agents }), adapter, { signal: controller.signal });
    expect(result.status).toBe('cancelled');
    expect(result.mission.status).toBe('cancelled');
    expect(result.mission.tasks[0].status).toBe('cancelled');
  });

  it('enforces a deadline and attempts one bounded rescue', async () => {
    const adapter: AgentAdapter = {
      id: 'simulation',
      label: 'slow helper',
      execute: vi.fn((_job, signal) => new Promise<AgentJobReceipt>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      })),
    };
    const result = await executeMission(createMission({ goal: 'time out safely', agents }), adapter, {
      timeoutMs: 1_000,
    });
    expect(result.status).toBe('failed');
    expect(adapter.execute).toHaveBeenCalledTimes(2);
    expect(result.events.filter((event) => event.kind === 'handoff')).toHaveLength(1);
  }, 3_000);
});
