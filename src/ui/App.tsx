import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import type { Agent, Mission } from '../runtime/types';
import { createMission } from '../runtime/mission';
import { AgentCreator, makeStartingAgents } from './AgentCreator';
import { GoalForm } from './GoalForm';
import { MissionBoard } from './MissionBoard';
import { HelperConnection } from './HelperConnection';
import type { AgentJobReceipt, ProviderId } from '../orchestration/types';
import {
  MAX_RECOVERY_BYTES,
  RecoveryError,
  clearRecoverySnapshot,
  createRecoverySnapshot,
  loadRecoverySnapshot,
  parseRecoverySnapshot,
  recoveryFilename,
  saveRecoverySnapshot,
  serializeRecoverySnapshot,
  shouldPauseLiveRestore,
  type RecoveryLiveState,
  type RecoverySnapshot,
} from '../recovery/snapshot';

type Phase = 'create' | 'goal' | 'mission';

export function App() {
  const initialRecovery = useState(loadInitialRecovery)[0];
  const [phase, setPhase] = useState<Phase>('create');
  const [agents, setAgents] = useState<Agent[]>(() => makeStartingAgents());
  const [goal, setGoal] = useState<string>('');
  const [mission, setMission] = useState<Mission | null>(null);
  const [provider, setProvider] = useState<ProviderId>('simulation');
  const [initialReceipts, setInitialReceipts] = useState<AgentJobReceipt[]>([]);
  const [requireLiveResume, setRequireLiveResume] = useState(false);
  const [recoveryCandidate, setRecoveryCandidate] = useState<RecoverySnapshot | null>(initialRecovery.snapshot);
  const [latestSnapshot, setLatestSnapshot] = useState<RecoverySnapshot | null>(initialRecovery.snapshot);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(initialRecovery.error);
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  });

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);

  const startMission = (g: string) => {
    setGoal(g);
    setMission(createMission({ goal: g, agents }));
    setInitialReceipts([]);
    setRequireLiveResume(false);
    setRecoveryCandidate(null);
    setPhase('mission');
  };

  const reset = () => {
    try { clearRecoverySnapshot(); } catch { /* storage may be unavailable */ }
    setMission(null);
    setInitialReceipts([]);
    setRequireLiveResume(false);
    setLatestSnapshot(null);
    setRecoveryCandidate(null);
    setRecoveryNotice(null);
    setPhase('create');
  };

  const checkpoint = useCallback((nextMission: Mission, receipts: AgentJobReceipt[], liveState: RecoveryLiveState) => {
    try {
      const snapshot = createRecoverySnapshot({
        provider,
        goal: nextMission.goal,
        agents: nextMission.agents,
        mission: nextMission,
        receipts,
        liveState,
      });
      saveRecoverySnapshot(snapshot);
      setLatestSnapshot(snapshot);
      setRecoveryNotice((current) => current?.startsWith('Checkpoint paused') ? null : current);
    } catch (error) {
      setLatestSnapshot(null);
      setRecoveryNotice(`Checkpoint paused: ${recoveryMessage(error)}`);
    }
  }, [provider]);

  const continueRecovery = () => {
    if (!recoveryCandidate) return;
    setAgents(recoveryCandidate.agents);
    setGoal(recoveryCandidate.goal);
    setMission(recoveryCandidate.mission);
    setProvider(recoveryCandidate.provider);
    setInitialReceipts(recoveryCandidate.receipts);
    setRequireLiveResume(shouldPauseLiveRestore(recoveryCandidate));
    setLatestSnapshot(recoveryCandidate);
    setRecoveryCandidate(null);
    setRecoveryNotice(null);
    setPhase('mission');
  };

  const discardRecovery = () => {
    try { clearRecoverySnapshot(); } catch { /* storage may be unavailable */ }
    setRecoveryCandidate(null);
    setLatestSnapshot(null);
    setRecoveryNotice('Saved checkpoint cleared.');
  };

  const exportRecovery = () => {
    const snapshot = latestSnapshot ?? recoveryCandidate;
    if (!snapshot) {
      setRecoveryNotice('There is no mission checkpoint to save yet.');
      return;
    }
    try {
      const blob = new Blob([serializeRecoverySnapshot(snapshot)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = recoveryFilename(snapshot);
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setRecoveryNotice('Portable handoff saved. It contains mission text and results, but never provider credentials.');
    } catch (error) {
      setRecoveryNotice(recoveryMessage(error));
    }
  };

  const importRecovery = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_RECOVERY_BYTES) {
      setRecoveryNotice('That handoff file is too large.');
      return;
    }
    try {
      const snapshot = parseRecoverySnapshot(await file.text());
      setRecoveryCandidate(snapshot);
      setLatestSnapshot(snapshot);
      setRecoveryNotice('Handoff checked. Review it below before continuing.');
    } catch (error) {
      setRecoveryNotice(recoveryMessage(error));
    }
  };

  return (
    <main className={`app ${reducedMotion ? 'reduced-motion' : ''}`}>
      <header>
        <div className="brand">
          <BrandOrb />
          <div>
            <h1>
              <span className="codename">Open-source preview</span>
              Relaylings
            </h1>
            <p className="tagline">
              Make a few cute helpers. Give them a goal. Watch them share the work
              and finish together. {provider === 'simulation' ? 'Nothing leaves your device.' : 'Your selected helper bridge does the real work.'}
            </p>
          </div>
        </div>
        <div className="controls" style={{ marginLeft: 'auto' }}>
          <label
            style={{
              display: 'inline-flex',
              gap: '0.5rem',
              alignItems: 'center',
              margin: 0,
              fontWeight: 600,
              color: 'var(--ink-dim)',
              fontSize: '0.9rem',
            }}
          >
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={(e) => setReducedMotion(e.target.checked)}
              style={{ width: 'auto', minHeight: 0 }}
            />
            Calm motion
          </label>
        </div>
      </header>

      <nav className="stepper" aria-label="Progress">
        <span aria-current={phase === 'create' ? 'step' : undefined} className={`chip ${phase === 'create' ? 'active' : phase === 'goal' || phase === 'mission' ? 'done' : ''}`}>
          1 · Make helpers
        </span>
        <span aria-current={phase === 'goal' ? 'step' : undefined} className={`chip ${phase === 'goal' ? 'active' : phase === 'mission' ? 'done' : ''}`}>
          2 · Set a goal
        </span>
        <span aria-current={phase === 'mission' ? 'step' : undefined} className={`chip ${phase === 'mission' ? 'active' : ''}`}>
          3 · Watch them work
        </span>
      </nav>

      {phase === 'create' && (
        <RecoveryShelf
          snapshot={recoveryCandidate}
          notice={recoveryNotice}
          onContinue={continueRecovery}
          onDiscard={discardRecovery}
          onExport={exportRecovery}
          onImport={importRecovery}
        />
      )}

      {phase === 'create' && (
        <AgentCreator agents={agents} onChange={setAgents} onDone={() => setPhase('goal')} />
      )}

      {phase === 'goal' && (
        <>
          <GoalForm
            initial={goal}
            onStart={startMission}
            onBack={() => setPhase('create')}
          />
          <HelperConnection value={provider} onChange={setProvider} />
        </>
      )}

      {phase === 'mission' && mission && (
        <MissionBoard
          mission={mission}
          onReset={reset}
          reducedMotion={reducedMotion}
          provider={provider}
          initialReceipts={initialReceipts}
          requireLiveResume={requireLiveResume}
          onCheckpoint={checkpoint}
          onExport={exportRecovery}
        />
      )}

      {phase === 'mission' && recoveryNotice && (
        <p className="recovery-notice" role="status">{recoveryNotice}</p>
      )}

      <p className="footer-note">
        {provider === 'simulation' ? 'Local-only · ' : 'Helper bridge selected · '}original characters · no tracking.
      </p>
    </main>
  );
}

interface RecoveryShelfProps {
  snapshot: RecoverySnapshot | null;
  notice: string | null;
  onContinue: () => void;
  onDiscard: () => void;
  onExport: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
}

function RecoveryShelf({ snapshot, notice, onContinue, onDiscard, onExport, onImport }: RecoveryShelfProps) {
  return (
    <aside className={`recovery-shelf ${snapshot ? 'has-checkpoint' : ''}`} aria-label="Mission handoff">
      {snapshot ? (
        <>
          <div className="recovery-orb" aria-hidden>↻</div>
          <div className="recovery-copy">
            <strong>Pick up where you left off?</strong>
            <span>“{snapshot.goal}” · {snapshot.mission.tasks.filter((task) => task.status === 'done').length} of {snapshot.mission.tasks.length} tasks done</span>
            <small>{snapshot.provider === 'simulation' ? 'Practice checkpoint' : `${providerName(snapshot.provider)} checkpoint — real helpers will stay paused`} · saved {formatSavedAt(snapshot.savedAt)}</small>
          </div>
          <div className="recovery-actions">
            <button className="primary" onClick={onContinue}>▶ Continue</button>
            <button onClick={onExport}>⇩ Save copy</button>
            <button className="ghost" onClick={onDiscard}>Start fresh</button>
          </div>
        </>
      ) : (
        <div className="recovery-copy compact">
          <strong>Have a handoff file?</strong>
          <span>Open it here. Nothing runs until you choose Continue.</span>
        </div>
      )}
      <label className="import-handoff">
        ⇧ Open handoff
        <input className="sr-only" type="file" accept="application/json,.json" onChange={onImport} />
      </label>
      {notice && <p className="recovery-notice" role="status">{notice}</p>}
    </aside>
  );
}

function loadInitialRecovery(): { snapshot: RecoverySnapshot | null; error: string | null } {
  if (typeof window === 'undefined') return { snapshot: null, error: null };
  try {
    return { snapshot: loadRecoverySnapshot(), error: null };
  } catch (error) {
    return { snapshot: null, error: `A saved checkpoint could not be opened: ${recoveryMessage(error)}` };
  }
}

function recoveryMessage(error: unknown): string {
  if (error instanceof RecoveryError || error instanceof Error) return error.message;
  return 'The checkpoint could not be saved or opened.';
}

function providerName(provider: ProviderId): string {
  if (provider === 'openrouter') return 'OpenRouter';
  if (provider === 'codex') return 'Codex';
  if (provider === 'claude') return 'Claude Code';
  return 'Practice';
}

function formatSavedAt(savedAt: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(savedAt));
  } catch {
    return 'recently';
  }
}

function BrandOrb() {
  return (
    <svg className="logo" viewBox="0 0 100 100" role="img" aria-label="Relaylings logo">
      <defs>
        <radialGradient id="brandGrad" cx="30%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#ffe58a" />
          <stop offset="60%" stopColor="#ffd66e" />
          <stop offset="100%" stopColor="#f39a30" />
        </radialGradient>
      </defs>
      <circle cx="30" cy="60" r="18" fill="#7ce0d3" opacity="0.85" />
      <circle cx="70" cy="62" r="16" fill="#ff9ec4" opacity="0.85" />
      <circle cx="50" cy="42" r="26" fill="url(#brandGrad)" stroke="#8a5a10" strokeWidth="2" />
      <g fill="#1a1400">
        <circle cx="42" cy="40" r="3" />
        <circle cx="58" cy="40" r="3" />
      </g>
      <path d="M44 50 q6 4 12 0" stroke="#1a1400" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}
