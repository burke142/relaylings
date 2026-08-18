import { describe, expect, it } from 'vitest';
import { createMission } from '../runtime/mission';
import type { Agent } from '../runtime/types';
import {
  MAX_RECOVERY_BYTES,
  RECOVERY_STORAGE_KEY,
  RecoveryError,
  clearRecoverySnapshot,
  createRecoverySnapshot,
  loadRecoverySnapshot,
  parseRecoverySnapshot,
  recoveryFilename,
  saveRecoverySnapshot,
  serializeRecoverySnapshot,
  shouldPauseLiveRestore,
  type KeyValueStorage,
} from './snapshot';

const agents: Agent[] = [
  { id: 'a-1', name: 'Dot', role: 'runner', hue: 40, eyeStyle: 'wide' },
  { id: 'a-2', name: 'Bop', role: 'helper', hue: 220, eyeStyle: 'happy' },
];

function fixture(provider: 'simulation' | 'openrouter' = 'simulation') {
  const mission = createMission({ goal: 'Plan a tiny garden', agents, seed: 42 });
  return createRecoverySnapshot({ provider, goal: mission.goal, agents, mission, savedAt: '2026-08-18T12:00:00.000Z' });
}

class MemoryStorage implements KeyValueStorage {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe('recovery snapshots', () => {
  it('round-trips a versioned snapshot without sharing mutable state', () => {
    const snapshot = fixture();
    const restored = parseRecoverySnapshot(serializeRecoverySnapshot(snapshot));
    expect(restored).toEqual(snapshot);
    restored.agents[0].name = 'Changed';
    expect(snapshot.agents[0].name).toBe('Dot');
  });

  it('saves, loads, and clears the fixed local checkpoint key', () => {
    const storage = new MemoryStorage();
    const snapshot = fixture();
    saveRecoverySnapshot(snapshot, storage);
    expect(storage.values.has(RECOVERY_STORAGE_KEY)).toBe(true);
    expect(loadRecoverySnapshot(storage)).toEqual(snapshot);
    clearRecoverySnapshot(storage);
    expect(loadRecoverySnapshot(storage)).toBeNull();
  });

  it('rejects malformed, oversized, unsupported, and open-schema files', () => {
    expect(() => parseRecoverySnapshot('{')).toThrow(RecoveryError);
    expect(() => parseRecoverySnapshot('x'.repeat(MAX_RECOVERY_BYTES + 1))).toThrow('too large');

    const future = JSON.parse(serializeRecoverySnapshot(fixture())) as Record<string, unknown>;
    future.version = 99;
    expect(() => parseRecoverySnapshot(JSON.stringify(future))).toThrow('version');

    const open = JSON.parse(serializeRecoverySnapshot(fixture())) as Record<string, unknown>;
    open.apiKey = 'not-even-a-key';
    expect(() => parseRecoverySnapshot(JSON.stringify(open))).toThrow('not allowed');
  });

  it('rejects credential-like text before local save or export', () => {
    const snapshot = fixture();
    snapshot.goal = 'Use api_key = sk-or-v1-1234567890abcdef';
    snapshot.mission.goal = snapshot.goal;
    expect(() => serializeRecoverySnapshot(snapshot)).toThrow('credential');

    const namedEnvironmentKey = fixture();
    namedEnvironmentKey.goal = 'OPENROUTER_API_KEY=definitely-not-for-a-handoff';
    namedEnvironmentKey.mission.goal = namedEnvironmentKey.goal;
    expect(() => serializeRecoverySnapshot(namedEnvironmentKey)).toThrow('credential');
  });

  it('rejects inconsistent mission, team, receipt, and completion state', () => {
    const teamMismatch = fixture();
    teamMismatch.agents[0].name = 'Someone else';
    expect(() => serializeRecoverySnapshot(teamMismatch)).toThrow('team');

    const wrongReceipt = fixture('openrouter');
    wrongReceipt.receipts.push({
      version: 1,
      jobId: 'other-mission:task-1:1',
      provider: 'openrouter',
      status: 'completed',
      output: 'done',
      durationMs: 10,
    });
    expect(() => serializeRecoverySnapshot(wrongReceipt)).toThrow('does not belong');

    const falseFinish = fixture();
    falseFinish.mission.status = 'complete';
    expect(() => serializeRecoverySnapshot(falseFinish)).toThrow('completed mission');
  });

  it('requires an explicit resume only for unfinished connected work', () => {
    expect(shouldPauseLiveRestore(fixture())).toBe(false);
    const live = fixture('openrouter');
    expect(shouldPauseLiveRestore(live)).toBe(true);
    live.mission.tasks.forEach((task) => { task.status = 'done'; task.stepsRemaining = 0; });
    live.mission.status = 'complete';
    live.mission.destinationReached = true;
    expect(shouldPauseLiveRestore(live)).toBe(false);
  });

  it('uses a stable, date-labelled export filename', () => {
    expect(recoveryFilename(fixture())).toBe('relaylings-handoff-2026-08-18.json');
  });
});
