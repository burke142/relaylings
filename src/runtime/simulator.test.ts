import { describe, expect, it } from 'vitest';
import type { Agent } from './types';
import { createMission } from './mission';
import { runUntilComplete, tick } from './simulator';

function makeAgents(): Agent[] {
  return [
    { id: 'a1', name: 'Zippy', role: 'planner', hue: 200, eyeStyle: 'wide' },
    { id: 'a2', name: 'Marble', role: 'runner', hue: 40, eyeStyle: 'sparkle' },
    { id: 'a3', name: 'Puddle', role: 'checker', hue: 300, eyeStyle: 'sleepy' },
    { id: 'a4', name: 'Cloud', role: 'helper', hue: 120, eyeStyle: 'happy' },
  ];
}

describe('simulator', () => {
  it('assigns the first pending task on the first tick', () => {
    const m0 = createMission({ goal: 'demo the arcade', agents: makeAgents() });
    const m1 = tick(m0);
    expect(m1.tick).toBe(1);
    expect(m1.tasks[0].assignedTo).toBeTruthy();
    expect(['assigned', 'inProgress']).toContain(m1.tasks[0].status);
    expect(m1.messages.some((msg) => msg.kind === 'assign')).toBe(true);
  });

  it('triggers a stall at the configured tick and task', () => {
    const m0 = createMission({
      goal: 'demo the arcade',
      agents: makeAgents(),
      stallAtTick: 8,
      stallTaskIndex: 2,
      recoverAfterTicks: 3,
    });
    let m = m0;
    for (let i = 0; i < 15; i++) m = tick(m);
    const stalled = m.messages.some((msg) => msg.kind === 'stall');
    expect(stalled).toBe(true);
    expect(m.stallScheduled.triggered).toBe(true);
  });

  it('recovers a stalled task by reassigning to a helper', () => {
    const m0 = createMission({
      goal: 'demo the arcade',
      agents: makeAgents(),
      stallAtTick: 8,
      stallTaskIndex: 2,
      recoverAfterTicks: 2,
    });
    let m = m0;
    for (let i = 0; i < 40; i++) m = tick(m);
    const handoff = m.messages.find((msg) => msg.kind === 'handoff');
    expect(handoff).toBeTruthy();
    expect(m.stallScheduled.recovered).toBe(true);
    expect(m.tasks[2].assignedTo).toBe('a4');
  });

  it('does not fake a handoff when no second agent exists', () => {
    const onlyAgent = makeAgents().slice(0, 1);
    const m0 = createMission({
      goal: 'solo mission',
      agents: onlyAgent,
      stallAtTick: 1,
      stallTaskIndex: 0,
      recoverAfterTicks: 1,
    });
    let m = m0;
    for (let i = 0; i < 10; i++) m = tick(m);
    expect(m.tasks[0].status).toBe('stalled');
    expect(m.messages.some((msg) => msg.kind === 'handoff')).toBe(false);
    expect(m.stallScheduled.recovered).toBe(false);
  });

  it('runs to completion and reaches the destination', () => {
    const m0 = createMission({ goal: 'demo the arcade', agents: makeAgents() });
    const m = runUntilComplete(m0, 200);
    expect(m.status).toBe('complete');
    expect(m.destinationReached).toBe(true);
    expect(m.tasks.every((t) => t.status === 'done')).toBe(true);
    expect(m.messages.some((msg) => msg.kind === 'arrive')).toBe(true);
  });

  it('is fully deterministic for identical inputs', () => {
    const agents = makeAgents();
    const a = runUntilComplete(createMission({ goal: 'same', agents }));
    const b = runUntilComplete(createMission({ goal: 'same', agents }));
    expect(a.tick).toBe(b.tick);
    expect(a.messages.map((m) => m.text)).toEqual(b.messages.map((m) => m.text));
    expect(a.tasks.map((t) => t.status)).toEqual(b.tasks.map((t) => t.status));
  });

  it('does not mutate the input mission', () => {
    const m0 = createMission({ goal: 'immutability', agents: makeAgents() });
    const snapshot = JSON.stringify(m0);
    tick(m0);
    expect(JSON.stringify(m0)).toBe(snapshot);
  });
});
