import { useEffect, useMemo, useState } from 'react';
import { tick } from '../runtime/simulator';
import type { Mission, Task, Message } from '../runtime/types';
import { OrbAgent } from './OrbAgent';
import { SpeechBubble } from './SpeechBubble';
import { Celebration } from './Celebration';
import { ActivityLog } from './ActivityLog';
import { ProxyAdapter } from '../orchestration/adapters/proxy';
import { executeMission } from '../orchestration/orchestrator';
import type { AgentJobReceipt, ProviderId } from '../orchestration/types';
import type { RecoveryLiveState } from '../recovery/snapshot';

interface Props {
  mission: Mission;
  onReset: () => void;
  reducedMotion: boolean;
  provider: ProviderId;
  initialReceipts?: AgentJobReceipt[];
  requireLiveResume?: boolean;
  onCheckpoint: (mission: Mission, receipts: AgentJobReceipt[], liveState: RecoveryLiveState) => void;
  onExport: () => void;
}

type Speed = 'slow' | 'normal' | 'fast';
const SPEED_MS: Record<Speed, number> = { slow: 1500, normal: 900, fast: 500 };

export function MissionBoard({
  mission,
  onReset,
  reducedMotion,
  provider,
  initialReceipts = [],
  requireLiveResume = false,
  onCheckpoint,
  onExport,
}: Props) {
  const isLive = provider !== 'simulation';
  const [state, setState] = useState<Mission>(mission);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<Speed>('normal');
  const [liveStatus, setLiveStatus] = useState<RecoveryLiveState>(
    isLive && requireLiveResume ? 'paused' : mission.status === 'complete' ? 'complete' : 'idle',
  );
  const [liveReceipts, setLiveReceipts] = useState<AgentJobReceipt[]>(initialReceipts);
  const [liveController, setLiveController] = useState<AbortController | null>(null);
  const [liveStarted, setLiveStarted] = useState(!isLive || !requireLiveResume);

  // Reset when a new mission comes in.
  useEffect(() => {
    setState(mission);
    setPlaying(!isLive);
    setLiveReceipts(initialReceipts);
    setLiveStarted(!isLive || !requireLiveResume);
    setLiveStatus(isLive && requireLiveResume ? 'paused' : mission.status === 'complete' ? 'complete' : 'idle');
  }, [mission, isLive, initialReceipts, requireLiveResume]);

  useEffect(() => {
    if (!isLive) {
      setLiveStatus('idle');
      setLiveController(null);
      return;
    }
    if (!liveStarted) return;
    if (mission.status === 'complete') {
      setLiveStatus('complete');
      return;
    }
    const controller = new AbortController();
    setLiveController(controller);
    setLiveStatus('running');
    const adapter = new ProxyAdapter({ provider });
    void executeMission(mission, adapter, {
      signal: controller.signal,
      initialReceipts,
      onState: setState,
      onReceipt: (receipt) => setLiveReceipts((current) => [
        ...current.filter((existing) => existing.jobId !== receipt.jobId),
        receipt,
      ]),
    }).then((result) => {
      setState(result.mission);
      setLiveStatus(result.status);
      setLiveController(null);
    }).catch(() => {
      setLiveStatus('failed');
      setLiveController(null);
    });
    return () => controller.abort();
  }, [initialReceipts, isLive, liveStarted, mission, provider]);

  useEffect(() => {
    onCheckpoint(state, liveReceipts, liveStatus);
  }, [liveReceipts, liveStatus, onCheckpoint, state]);

  useEffect(() => {
    if (isLive || !playing) return;
    if (state.status === 'complete') return;
    const id = window.setInterval(() => {
      setState((prev) => (prev.status === 'complete' ? prev : tick(prev)));
    }, SPEED_MS[speed]);
    return () => window.clearInterval(id);
  }, [isLive, playing, state.status, speed]);

  const advanceOne = () => setState((prev) => (prev.status === 'complete' ? prev : tick(prev)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isInteractiveTarget(e.target)) return;
      if (!isLive && e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
      else if (!isLive && (e.key === 's' || e.key === 'S')) { advanceOne(); }
      else if (e.key === 'r' || e.key === 'R') { onReset(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, onReset]);

  const agentsById = useMemo(
    () => new Map(state.agents.map((a) => [a.id, a])),
    [state.agents],
  );

  const activeTaskIndex = state.tasks.findIndex((t) => t.status !== 'done' && t.status !== 'cancelled');
  const anyStalled = state.tasks.some((t) => t.status === 'stalled');
  const busyAgentIds = new Set(
    state.tasks
      .filter((t) => t.assignedTo && (t.status === 'assigned' || t.status === 'inProgress' || t.status === 'stalled'))
      .map((t) => t.assignedTo as string),
  );
  const freeAgents = state.agents.filter((a) => !busyAgentIds.has(a.id));

  const totalSteps = state.tasks.reduce((acc, t) => acc + t.stepsTotal, 0);
  const doneSteps = state.tasks.reduce((acc, t) => acc + (t.stepsTotal - t.stepsRemaining), 0);
  const pct = totalSteps === 0 ? 0 : Math.round((doneSteps / totalSteps) * 100);

  // Latest message per (taskId, agentId) within a small recency window.
  const bubbleForTask = useMemo(() => bubblesByTask(state), [state]);

  const complete = state.status === 'complete';

  return (
    <section className={`panel ${reducedMotion ? 'reduced-motion' : ''}`} aria-labelledby="mission-heading">
      <h2 id="mission-heading">Step 3 — Watch your helpers work</h2>
      <p className="subhead">
        Each helper takes a stop. If someone gets stuck, another one steps in. {isLive ? 'Results come through your local bridge.' : 'You can pause any time.'}
      </p>

      {isLive && (
        <div className="live-mode-banner" role="status">
          <span className="live-dot" aria-hidden />
          <strong>{providerLabel(provider)}</strong>
          <span>{liveStatus === 'running' ? 'working on the mission' : liveStatus === 'paused' ? 'paused after recovery' : liveStatus === 'complete' ? 'finished the mission' : liveStatus === 'cancelled' ? 'stopped safely' : liveStatus === 'failed' ? 'needs attention' : 'getting ready'}</span>
        </div>
      )}

      {isLive && liveStatus === 'paused' && (
        <div className="recovery-caution" role="note">
          <strong>Checkpoint restored — real helpers are paused.</strong>
          <span> Resume only when you are ready. The unfinished task may be sent again; completed tasks will not be repeated.</span>
        </div>
      )}

      <div className="mission-goal" aria-label="Goal">
        <span className="badge">Goal</span>
        <span className="goal-quote">{state.goal}</span>
      </div>

      <div
        className="progress-gauge"
        role="progressbar"
        aria-label="Mission progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}% complete`}
      >
        <div className="bar"><span style={{ width: `${pct}%` }} /></div>
        <div className="label" aria-hidden>{pct}%</div>
      </div>

      <div className="controls" style={{ marginTop: '0.9rem' }}>
        {isLive ? (
          <button
            className="primary"
            onClick={() => liveStatus === 'paused' ? setLiveStarted(true) : liveController?.abort()}
            disabled={liveStatus !== 'running' && liveStatus !== 'paused'}
            aria-label={liveStatus === 'paused' ? 'Resume connected helpers' : 'Stop connected helpers'}
          >
            {liveStatus === 'paused' ? '▶ Resume unfinished task' : liveStatus === 'running' ? '■ Stop safely' : liveStatus === 'complete' ? '✓ Finished' : liveStatus === 'cancelled' ? 'Stopped safely' : 'Needs help'}
          </button>
        ) : (
          <>
            <button
              className="primary"
              onClick={() => setPlaying((p) => !p)}
              aria-pressed={playing}
              aria-label={playing ? 'Pause the mission' : 'Play the mission'}
            >
              {playing ? '⏸ Pause' : '▶ Play'}
            </button>
            <button onClick={advanceOne} disabled={complete} aria-label="Advance one step">↷ Step</button>
          </>
        )}
        <button onClick={onExport} className="ghost" aria-label="Save a portable handoff file">⇩ Save handoff</button>
        <button onClick={onReset} className="ghost" aria-label="Start over">↺ Start over</button>
        {!isLive && <div role="group" aria-label="Speed" style={{ display: 'flex', gap: 4 }}>
          {(['slow', 'normal', 'fast'] as Speed[]).map((s) => (
            <button
              key={s}
              className={speed === s ? 'primary' : ''}
              aria-pressed={speed === s}
              onClick={() => setSpeed(s)}
              style={{ minWidth: 62 }}
            >
              {s}
            </button>
          ))}
        </div>}
        <div className="spacer" />
        <div className="status-live" aria-live="polite">
          {isLive ? <><strong>{state.tasks.filter((task) => task.status === 'done').length}</strong> / {state.tasks.length} tasks</> : <>Step <strong>{state.tick}</strong></>} · {complete ? 'complete' : liveStatus === 'paused' ? 'paused safely' : liveStatus === 'cancelled' ? 'stopped safely' : liveStatus === 'failed' ? 'needs attention' : anyStalled ? 'rescue in progress' : 'in progress'}
        </div>
      </div>

      <div className="journey" role="group" aria-label="Mission journey">
        <div className="track">
          <RouteBackdrop count={state.tasks.length + 2} />
          <div className="stop endpoint" aria-label="Start">
            <div className="marker" aria-hidden>🚩</div>
            <div className="stop-title">Start</div>
          </div>

          {state.tasks.map((task, i) => {
            const active = i === activeTaskIndex;
            const done = task.status === 'done';
            const stalled = task.status === 'stalled';
            const agent = task.status !== 'cancelled' && task.assignedTo ? agentsById.get(task.assignedTo) : undefined;
            const bubble = bubbleForTask.get(task.id);
            return (
              <div
                key={task.id}
                className={`stop ${done ? 'done' : ''} ${active ? 'active' : ''} ${stalled ? 'stalled' : ''}`}
                aria-label={`Stop ${i + 1}: ${shortTitle(task)}. ${statusPhrase(task)}`}
              >
                {bubble && agent && (
                  <SpeechBubble message={bubble} who={agent.name} />
                )}
                <div className="stop-title">
                  <span className="stop-index" aria-hidden>{i + 1}</span>
                  {shortTitle(task)}
                </div>
                <div className="plain">{task.plain}</div>
                <SparkRow task={task} />
                <div className="orb-slot">
                  {agent && (
                    <OrbAgent
                      agent={agent}
                      size={54}
                      mood={done ? 'done' : stalled ? 'stalled' : 'working'}
                      showRole
                      chatty
                      ariaLabel={`${agent.name} is ${statusPhrase(task)}`}
                    />
                  )}
                </div>
              </div>
            );
          })}

          <div className={`stop endpoint ${state.destinationReached ? 'done' : ''}`} aria-label="Destination">
            <div className="marker" aria-hidden>{state.destinationReached ? '🏆' : '🎯'}</div>
            <div className="stop-title">Finish</div>
          </div>
        </div>

        <div className="bench" aria-label="Helpers waiting on the bench">
          <div className="bench-label">
            {complete
              ? 'Great team.'
              : anyStalled
              ? 'Rescue crew ready'
              : freeAgents.length === 0
              ? 'Everyone is on a task'
              : 'Waiting to help'}
          </div>
          <div className="orbs">
            {freeAgents.length === 0 ? (
              <span className="empty">…all helpers are busy</span>
            ) : (
              freeAgents.map((a) => (
                <OrbAgent
                  key={a.id}
                  agent={a}
                  size={44}
                  mood={anyStalled && a.role === 'helper' ? 'working' : 'idle'}
                  showRole
                  ariaLabel={`${a.name}, ${anyStalled && a.role === 'helper' ? 'about to rescue' : 'waiting'}`}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {complete && (
        <Celebration
          goal={state.goal}
          ticks={state.tick}
          taskCount={isLive ? state.tasks.length : undefined}
          onReplay={onReset}
          reducedMotion={reducedMotion}
        />
      )}

      <ActivityLog messages={state.messages} agents={state.agents} />

      {isLive && liveReceipts.length > 0 && (
        <details className="helper-results">
          <summary>Helper results ({liveReceipts.filter((receipt) => receipt.status === 'completed').length})</summary>
          <div className="result-list">
            {liveReceipts.map((receipt) => (
              <article key={receipt.jobId} className={receipt.status === 'failed' ? 'result failed' : 'result'}>
                <strong>{taskNameForReceipt(state, receipt)}</strong>
                <p>{receipt.output ?? receipt.error?.message ?? 'No result returned.'}</p>
                <small>{receipt.provider} · {(receipt.durationMs / 1000).toFixed(1)}s{receipt.usage?.costUsd !== undefined ? ` · $${receipt.usage.costUsd.toFixed(4)}` : ''}</small>
              </article>
            ))}
          </div>
        </details>
      )}

      <p className="helper-row" style={{ marginTop: '0.6rem' }}>
        {isLive ? <>Key: <kbd>R</kbd> start over</> : <>Keys: <kbd>Space</kbd> play/pause · <kbd>S</kbd> one step · <kbd>R</kbd> start over</>}
      </p>
    </section>
  );
}

// ------------------- helpers -------------------

function SparkRow({ task }: { task: Task }) {
  const done = task.stepsTotal - task.stepsRemaining;
  return (
    <div className="spark-row" aria-hidden>
      {Array.from({ length: task.stepsTotal }).map((_, i) => (
        <span key={i} className={`spark ${i < done ? 'done' : ''}`} />
      ))}
    </div>
  );
}

function RouteBackdrop({ count }: { count: number }) {
  // Decorative wavy path stretching across the journey. The number of
  // control points is derived from the stop count so it reads as
  // continuous even with 3 or 8 stops.
  const width = 1000;
  const height = 100;
  const midY = 50;
  const amp = 22;
  const segments = Math.max(4, count);
  const dx = width / segments;
  let d = `M 0 ${midY}`;
  for (let i = 0; i < segments; i++) {
    const x0 = i * dx;
    const x1 = x0 + dx;
    const cy = i % 2 === 0 ? midY - amp : midY + amp;
    d += ` Q ${x0 + dx / 2} ${cy} ${x1} ${midY}`;
  }
  return (
    <div className="route-bg" aria-hidden>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <path d={d} fill="none" stroke="rgba(255, 214, 110, 0.22)" strokeWidth="10" strokeLinecap="round" />
        <path className="dashed" d={d} fill="none" stroke="rgba(255, 214, 110, 0.65)" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function bubblesByTask(state: Mission): Map<string, Message> {
  // Show the latest message per task if it was emitted within the last
  // 2 ticks — keeps bubbles fresh without becoming a persistent label.
  const out = new Map<string, Message>();
  const now = state.tick;
  const priority: Record<Message['kind'], number> = {
    stall: 6,
    handoff: 6,
    done: 5,
    arrive: 5,
    progress: 3,
    assign: 4,
    ack: 2,
    greet: 1,
  };
  for (const m of state.messages) {
    if (!m.taskId) continue;
    if (now - m.tick > 2) continue;
    const existing = out.get(m.taskId);
    if (
      !existing ||
      priority[m.kind] > priority[existing.kind] ||
      (priority[m.kind] === priority[existing.kind] && m.tick >= existing.tick)
    ) {
      out.set(m.taskId, m);
    }
  }
  return out;
}

function shortTitle(task: Task): string {
  const dash = task.title.indexOf(' — ');
  return dash > 0 ? task.title.slice(0, dash) : task.title;
}

function statusPhrase(task: Task): string {
  switch (task.status) {
    case 'done':       return 'done';
    case 'stalled':    return 'stuck — needs help';
    case 'inProgress': return `working (${task.stepsTotal - task.stepsRemaining}/${task.stepsTotal})`;
    case 'assigned':   return 'just started';
    case 'cancelled':  return 'stopped safely';
    default:           return 'waiting';
  }
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(target.tagName);
}

function providerLabel(provider: ProviderId): string {
  if (provider === 'codex') return 'Codex';
  if (provider === 'claude') return 'Claude Code';
  if (provider === 'openrouter') return 'OpenRouter team';
  return 'Practice helpers';
}

function taskNameForReceipt(mission: Mission, receipt: AgentJobReceipt): string {
  const taskId = receipt.jobId.split(':').at(-2);
  return mission.tasks.find((task) => task.id === taskId)?.title ?? 'Task result';
}
