import React, { useState } from 'react';

interface Props {
  onStart: (goal: string) => void;
  onBack: () => void;
  initial?: string;
}

const SUGGESTIONS = [
  'plan a small birthday party',
  'write a short thank-you note',
  'tidy up my email inbox',
  'draft a weekend to-do list',
  'brainstorm names for a new puppy',
];

export function GoalForm({ onStart, onBack, initial = '' }: Props) {
  const [goal, setGoal] = useState(initial);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal.trim()) return;
    onStart(goal.trim());
  };

  return (
    <section className="panel" aria-labelledby="goal-heading">
      <h2 id="goal-heading">Step 2 — What do you want to get done?</h2>
      <p className="subhead">
        Say it in a normal sentence. Your helpers will break it into small pieces you can see.
      </p>

      <form onSubmit={submit}>
        <label htmlFor="goal-input">Your goal</label>
        <input
          id="goal-input"
          type="text"
          value={goal}
          maxLength={500}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="For example: plan a small birthday party"
          autoFocus
          style={{ fontSize: '1.05rem' }}
        />
        <div className="helper-row" style={{ marginTop: '0.6rem' }}>
          <span>Or try:</span>
          {SUGGESTIONS.map((s) => (
            <button type="button" key={s} className="suggestion-chip" onClick={() => setGoal(s)}>
              {s}
            </button>
          ))}
        </div>
        <div className="controls" style={{ marginTop: '1.2rem' }}>
          <button type="button" onClick={onBack} aria-label="Back to helpers">← Back</button>
          <div className="spacer" />
          <button
            type="submit"
            className="primary big"
            disabled={!goal.trim()}
            aria-label="Start the mission"
          >
            Start the mission →
          </button>
        </div>
        <p className="helper-row" style={{ marginTop: '0.6rem' }}>
          <kbd>Enter</kbd> starts the mission.
        </p>
      </form>
    </section>
  );
}
