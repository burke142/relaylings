import { useState } from 'react';
import type { ProviderId } from '../orchestration/types';

interface Props {
  value: ProviderId;
  onChange: (provider: ProviderId) => void;
}

interface Health {
  ok: boolean;
  providers: ProviderId[];
}

const FRIENDLY: Record<ProviderId, string> = {
  simulation: 'Practice helpers',
  openrouter: 'OpenRouter team',
  codex: 'Codex',
  claude: 'Claude Code',
};

export function HelperConnection({ value, onChange }: Props) {
  const [checking, setChecking] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState('');

  const check = async () => {
    setChecking(true);
    setError('');
    try {
      const response = await fetch('/api/health', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Bridge unavailable.');
      const body = await response.json() as Partial<Health>;
      const providers = Array.isArray(body.providers)
        ? body.providers.filter(isRemoteProvider)
        : [];
      setHealth({ ok: body.ok === true, providers });
      if (providers.length === 0) setError('Bridge found, but no outside helpers are switched on.');
    } catch {
      setHealth(null);
      setError('No helper bridge found. Practice mode still works normally.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <details className="helper-connection">
      <summary>Want real AI helpers? <span>Optional</span></summary>
      <div className="connection-body">
        <p>
          Practice mode stays on this device. A connected helper sends your goal and task text
          through the local bridge; keys stay out of the browser.
        </p>
        <div className="provider-choices" role="group" aria-label="Helper source">
          <button
            type="button"
            aria-pressed={value === 'simulation'}
            className={value === 'simulation' ? 'primary' : ''}
            onClick={() => onChange('simulation')}
          >
            ✨ Practice mode
          </button>
          {health?.providers.map((provider) => (
            <button
              type="button"
              aria-pressed={value === provider}
              className={value === provider ? 'primary' : ''}
              onClick={() => onChange(provider)}
              key={provider}
            >
              {provider === 'codex' ? '◆' : provider === 'claude' ? '✦' : '◎'} {FRIENDLY[provider]}
            </button>
          ))}
          <button type="button" className="ghost" onClick={check} disabled={checking}>
            {checking ? 'Checking…' : health ? 'Check again' : 'Find connected helpers'}
          </button>
        </div>
        {value === 'openrouter' && (
          <p className="connection-warning">OpenRouter calls can cost money. The local bridge enforces your configured caps.</p>
        )}
        {error && <p className="connection-status" role="status">{error}</p>}
      </div>
    </details>
  );
}

function isRemoteProvider(value: unknown): value is Exclude<ProviderId, 'simulation'> {
  return value === 'openrouter' || value === 'codex' || value === 'claude';
}
