import { describe, expect, it } from 'vitest';
import { decomposeGoal } from './planner';

describe('decomposeGoal', () => {
  it('produces five tasks for any non-empty goal', () => {
    const tasks = decomposeGoal({ goal: 'plan a birthday party' });
    expect(tasks).toHaveLength(5);
    expect(tasks[0].status).toBe('pending');
  });

  it('is deterministic', () => {
    const a = decomposeGoal({ goal: 'ship the demo' });
    const b = decomposeGoal({ goal: 'ship the demo' });
    expect(a).toEqual(b);
  });

  it('assigns preferred roles across the plan', () => {
    const tasks = decomposeGoal({ goal: 'anything' });
    const roles = tasks.map((t) => t.preferredRole);
    expect(roles).toContain('planner');
    expect(roles).toContain('runner');
    expect(roles).toContain('checker');
  });

  it('handles empty goal gracefully', () => {
    const tasks = decomposeGoal({ goal: '' });
    expect(tasks).toHaveLength(5);
    expect(tasks[0].title).toContain('unspecified goal');
  });
});
