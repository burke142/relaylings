import { useState } from 'react';
import { OrbAgent } from './OrbAgent';
import type { Agent, EyeStyle, Role } from '../runtime/types';
import { ROLE_BLURB, ROLE_LABEL } from '../runtime/types';

interface Props {
  agents: Agent[];
  onChange: (agents: Agent[]) => void;
  onDone: () => void;
}

const EYE_OPTIONS: EyeStyle[] = ['wide', 'sparkle', 'happy', 'sleepy'];
const ROLE_OPTIONS: Role[] = ['planner', 'runner', 'checker', 'helper'];
const MIN_AGENTS = 2;
const MAX_AGENTS = 6;

let idCounter = 0;
function newAgent(index: number): Agent {
  idCounter += 1;
  const hues = [200, 40, 300, 120, 0, 260, 340, 80];
  const names = ['Zippy', 'Marble', 'Cloud', 'Puddle', 'Nib', 'Pebble', 'Waffle', 'Sprout'];
  const eyes: EyeStyle[] = ['wide', 'sparkle', 'happy', 'sleepy'];
  const roles: Role[] = ['runner', 'planner', 'checker', 'helper'];
  return {
    id: `agent-${Date.now().toString(36)}-${idCounter}`,
    name: names[index % names.length],
    role: roles[index % roles.length],
    hue: hues[index % hues.length],
    eyeStyle: eyes[index % eyes.length],
  };
}

export function AgentCreator({ agents, onChange, onDone }: Props) {
  const [editingId, setEditingId] = useState<string | null>(agents[0]?.id ?? null);

  const addAgent = () => {
    if (agents.length >= MAX_AGENTS) return;
    const next = [...agents, newAgent(agents.length)];
    onChange(next);
    setEditingId(next[next.length - 1].id);
  };
  const removeAgent = (id: string) => {
    const next = agents.filter((a) => a.id !== id);
    onChange(next);
    if (editingId === id) setEditingId(next[0]?.id ?? null);
  };
  const updateAgent = (id: string, patch: Partial<Agent>) => {
    onChange(agents.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  const editing = agents.find((a) => a.id === editingId) ?? agents[0];
  const rolesPresent = new Set(agents.map((a) => a.role));
  const missingRoles = ROLE_OPTIONS.filter((r) => !rolesPresent.has(r));
  const hasHelper = rolesPresent.has('helper');

  return (
    <section className="panel" aria-labelledby="create-heading">
      <h2 id="create-heading">Step 1 — Make your helpers</h2>
      <p className="subhead">
        Give each helper a name and a job. Keep at least one <strong>rescuer</strong> — they’ll step
        in when another helper gets stuck.
      </p>

      <div className="grid three" role="list" aria-label="Your helpers">
        {agents.map((a) => (
          <div
            key={a.id}
            role="listitem"
            className={`agent-card ${editingId === a.id ? 'editing' : ''}`}
          >
            <OrbAgent agent={a} size={90} showRole />
            <div style={{ fontWeight: 800, fontSize: '1rem' }}>{a.name}</div>
            <div className="role-tag">
              {ROLE_LABEL[a.role]}
            </div>
            <div className="role-line">{ROLE_BLURB[a.role]}</div>
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
              <button onClick={() => setEditingId(a.id)} aria-label={`Edit ${a.name}`}>Edit</button>
              <button
                className="ghost"
                onClick={() => removeAgent(a.id)}
                disabled={agents.length <= MIN_AGENTS}
                aria-label={`Remove ${a.name}`}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
        <div className="agent-card add-tile">
          <button
            className="primary big"
            onClick={addAgent}
            disabled={agents.length >= MAX_AGENTS}
            aria-label="Add another helper"
          >
            {agents.length >= MAX_AGENTS ? 'Team is full' : '+ Add a helper'}
          </button>
          <div className="role-line">{agents.length} / {MAX_AGENTS} helpers</div>
        </div>
      </div>

      {editing && (
        <div className="panel" style={{ marginTop: '1.2rem', background: 'rgba(0,0,0,0.15)', padding: '1.2rem' }}>
          <h3 style={{ marginTop: 0 }}>Edit: {editing.name}</h3>
          <div className="grid two">
            <div>
              <label htmlFor="name-input">Name</label>
              <input
                id="name-input"
                type="text"
                value={editing.name}
                maxLength={20}
                onChange={(e) => updateAgent(editing.id, { name: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="role-input">Job</label>
              <select
                id="role-input"
                value={editing.role}
                onChange={(e) => updateAgent(editing.id, { role: e.target.value as Role })}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]} — {ROLE_BLURB[r]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="hue-input">Color</label>
              <input
                id="hue-input"
                type="range"
                min={0}
                max={359}
                value={editing.hue}
                onChange={(e) => updateAgent(editing.id, { hue: Number(e.target.value) })}
                aria-valuetext={`hue ${editing.hue} of 359`}
              />
            </div>
            <div>
              <label htmlFor="eye-input">Eyes</label>
              <select
                id="eye-input"
                value={editing.eyeStyle}
                onChange={(e) => updateAgent(editing.id, { eyeStyle: e.target.value as EyeStyle })}
              >
                {EYE_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {!hasHelper && (
        <p className="helper-row" role="status">
          Tip: no <strong>Rescuer</strong> yet. It still works, but a rescuer is nice for when
          another helper gets stuck.
        </p>
      )}
      {hasHelper && missingRoles.length > 0 && (
        <p className="helper-row" role="status">
          You’re missing {missingRoles.map((r) => ROLE_LABEL[r]).join(', ')}. That’s fine — the
          mission still runs.
        </p>
      )}

      <div className="controls" style={{ marginTop: '1.2rem' }}>
        <div className="spacer" />
        <button
          className="primary big"
          onClick={onDone}
          disabled={agents.length < MIN_AGENTS}
          aria-label="Continue to setting a goal"
        >
          Next — set a goal →
        </button>
      </div>
    </section>
  );
}

export function makeStartingAgents(): Agent[] {
  return [
    { id: 'seed-1', name: 'Zippy', role: 'planner', hue: 200, eyeStyle: 'sparkle' },
    { id: 'seed-2', name: 'Marble', role: 'runner', hue: 40, eyeStyle: 'wide' },
    { id: 'seed-3', name: 'Cloud', role: 'helper', hue: 300, eyeStyle: 'happy' },
  ];
}
