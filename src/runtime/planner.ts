import type { Role, Task } from './types';

function shorten(s: string, n = 44): string {
  const t = s.trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1) + '…';
}

interface Template {
  suffix: string;
  plain: string;
  steps: number;
  preferredRole: Role;
}

const TEMPLATES: Template[] = [
  {
    suffix: 'Understand the goal',
    plain: 'Read the goal and say it back in a few plain words.',
    steps: 3,
    preferredRole: 'planner',
  },
  {
    suffix: 'Break it into pieces',
    plain: 'Decide the small steps that will get the goal done.',
    steps: 3,
    preferredRole: 'planner',
  },
  {
    suffix: 'Do the main work',
    plain: 'Actually do the steps. This is where most of the effort happens.',
    steps: 6,
    preferredRole: 'runner',
  },
  {
    suffix: 'Check the work',
    plain: 'Look over what got done and make sure it matches the goal.',
    steps: 3,
    preferredRole: 'checker',
  },
  {
    suffix: 'Deliver to the finish',
    plain: 'Hand the finished work to the destination.',
    steps: 2,
    preferredRole: 'runner',
  },
];

export interface DecomposeOptions {
  goal: string;
}

export function decomposeGoal(opts: DecomposeOptions): Task[] {
  const goalShort = shorten(opts.goal || 'unspecified goal');
  return TEMPLATES.map((t, i) => ({
    id: `task-${i + 1}`,
    title: `${t.suffix} — “${goalShort}”`,
    plain: t.plain,
    status: 'pending' as const,
    stepsRemaining: t.steps,
    stepsTotal: t.steps,
    createdAtTick: 0,
    preferredRole: t.preferredRole,
  }));
}
