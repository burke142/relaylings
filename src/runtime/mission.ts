import type { Agent, Mission } from './types';
import { decomposeGoal } from './planner';
import { hashString } from './rng';

export interface CreateMissionOptions {
  goal: string;
  agents: Agent[];
  seed?: number;
  stallTaskIndex?: number;
  stallAtTick?: number;
  recoverAfterTicks?: number;
}

export function createMission(opts: CreateMissionOptions): Mission {
  const seed = opts.seed ?? hashString(opts.goal + '|' + opts.agents.map((a) => a.id).join(','));
  const tasks = decomposeGoal({ goal: opts.goal });
  const stallTaskIndex = clamp(opts.stallTaskIndex ?? 2, 0, tasks.length - 1);
  return {
    id: `mission-${seed.toString(36)}`,
    goal: opts.goal,
    status: 'draft',
    tick: 0,
    seed,
    tasks,
    messages: [
      {
        id: 'm-greet',
        fromAgentId: opts.agents[0]?.id ?? 'system',
        kind: 'greet',
        text: `Hi! We are going to work on: “${opts.goal}”.`,
        tick: 0,
      },
    ],
    agents: opts.agents.slice(),
    destinationReached: false,
    stallScheduled: {
      taskIndex: stallTaskIndex,
      atTick: opts.stallAtTick ?? 3,
      recoverAfterTicks: opts.recoverAfterTicks ?? 2,
      triggered: false,
      recovered: false,
    },
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
