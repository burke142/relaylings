import type { Agent, EyeStyle, Role } from '../runtime/types';

interface Props {
  agent: Agent;
  size?: number;
  mood?: 'idle' | 'working' | 'stalled' | 'done';
  label?: boolean;
  ariaLabel?: string;
  showRole?: boolean;
  chatty?: boolean;
}

// Original circular orb character. No traced or copied characters.
// A soft filled circle with two eyes, a small expression line, and an
// optional role badge (planner/runner/checker/helper). Fully user-driven hue.
export function OrbAgent({
  agent,
  size = 64,
  mood = 'idle',
  label,
  ariaLabel,
  showRole = false,
  chatty = false,
}: Props) {
  const bg = `hsl(${agent.hue}, 78%, 62%)`;
  const shade = `hsl(${agent.hue}, 78%, 46%)`;
  const highlight = `hsl(${agent.hue}, 90%, 82%)`;
  const cls = `orb-svg ${mood === 'idle' ? 'wiggle' : mood}`;
  const stalled = mood === 'stalled';

  return (
    <figure
      style={{
        margin: 0,
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        position: 'relative',
      }}
    >
      <div style={{ position: 'relative', width: size, height: size }}>
        {mood === 'working' && (
          <span
            aria-hidden
            className="orb-halo working"
            style={{ width: size * 1.35, height: size * 1.35, left: -size * 0.175, top: -size * 0.175, position: 'absolute' }}
          />
        )}
        <svg
          className={cls}
          width={size}
          height={size}
          viewBox="0 0 100 100"
          role="img"
          aria-label={ariaLabel ?? `${agent.name}, ${agent.role}`}
        >
          <defs>
            <radialGradient id={`grad-${agent.id}`} cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor={highlight} />
              <stop offset="60%" stopColor={bg} />
              <stop offset="100%" stopColor={shade} />
            </radialGradient>
          </defs>
          <g className="body">
            <circle cx="50" cy="50" r="42" fill={`url(#grad-${agent.id})`} stroke={shade} strokeWidth="2" />
            {/* soft cheek blush */}
            <circle cx="30" cy="60" r="5" fill={highlight} opacity="0.55" />
            <circle cx="70" cy="60" r="5" fill={highlight} opacity="0.55" />
            {renderEyes(agent.eyeStyle, stalled)}
            {renderExpression(mood, chatty)}
            {mood === 'done' && (
              <g stroke={highlight} strokeWidth="2" strokeLinecap="round" opacity="0.9">
                <path d="M18 22 l6 6 M74 22 l-6 6" />
                <path d="M12 46 l6 0 M82 46 l6 0" />
              </g>
            )}
          </g>
        </svg>
        {showRole && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              right: -3,
              bottom: -3,
              width: Math.max(20, size * 0.32),
              height: Math.max(20, size * 0.32),
              borderRadius: '50%',
              background: '#fffdf3',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 3px 6px rgba(0,0,0,0.35)',
              border: `2px solid ${shade}`,
              color: '#1a1400',
            }}
          >
            <RoleGlyph role={agent.role} size={Math.max(12, size * 0.2)} />
          </span>
        )}
      </div>
      {label && (
        <figcaption style={{ fontSize: 12, textAlign: 'center' }}>
          <div style={{ fontWeight: 700 }}>{agent.name}</div>
          <div style={{ opacity: 0.7 }}>{roleWord(agent.role)}</div>
        </figcaption>
      )}
    </figure>
  );
}

function renderEyes(style: EyeStyle, stalled: boolean) {
  if (stalled) {
    return (
      <g stroke="#111" strokeWidth="2.4" strokeLinecap="round">
        <path d="M32 42 l10 10 M42 42 l-10 10" />
        <path d="M58 42 l10 10 M68 42 l-10 10" />
      </g>
    );
  }
  switch (style) {
    case 'sleepy':
      return (
        <g stroke="#111" strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M28 46 q6 6 14 0" />
          <path d="M58 46 q6 6 14 0" />
        </g>
      );
    case 'sparkle':
      return (
        <g fill="#111">
          <circle cx="36" cy="46" r="5" />
          <circle cx="64" cy="46" r="5" />
          <circle cx="34" cy="44" r="1.4" fill="#fff" />
          <circle cx="62" cy="44" r="1.4" fill="#fff" />
        </g>
      );
    case 'happy':
      return (
        <g stroke="#111" strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M28 48 q6 -6 14 0" />
          <path d="M58 48 q6 -6 14 0" />
        </g>
      );
    case 'wide':
    default:
      return (
        <g fill="#111">
          <circle cx="36" cy="46" r="6" />
          <circle cx="64" cy="46" r="6" />
          <circle cx="37" cy="44" r="1.6" fill="#fff" />
          <circle cx="65" cy="44" r="1.6" fill="#fff" />
        </g>
      );
  }
}

function renderExpression(mood: 'idle' | 'working' | 'stalled' | 'done', chatty: boolean) {
  if (mood === 'done') {
    return <path d="M38 66 q12 10 24 0" stroke="#111" strokeWidth="3" fill="none" strokeLinecap="round" />;
  }
  if (mood === 'stalled') {
    return <path d="M38 70 q12 -6 24 0" stroke="#111" strokeWidth="3" fill="none" strokeLinecap="round" />;
  }
  if (mood === 'working') {
    // small chatter dots — not a pie-mouth
    return (
      <g fill="#111">
        <circle cx="44" cy="68" r="1.8" />
        <circle cx="50" cy="69" r="1.8" />
        <circle cx="56" cy="68" r="1.8" />
      </g>
    );
  }
  if (chatty) {
    return <path d="M40 66 q10 8 20 0" stroke="#111" strokeWidth="3" fill="none" strokeLinecap="round" />;
  }
  return <path d="M40 66 q10 5 20 0" stroke="#111" strokeWidth="3" fill="none" strokeLinecap="round" />;
}

function RoleGlyph({ role, size }: { role: Role; size: number }) {
  const stroke = '#1a1400';
  const w = size;
  const h = size;
  const s = { width: w, height: h };
  switch (role) {
    case 'planner':
      // small clipboard with tick
      return (
        <svg viewBox="0 0 20 20" {...s} aria-hidden>
          <rect x="4" y="3" width="12" height="14" rx="2" fill="#ffe58a" stroke={stroke} strokeWidth="1.4" />
          <rect x="7" y="1.5" width="6" height="3" rx="1" fill={stroke} />
          <path d="M6.5 11 l2 2 l4 -5" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'runner':
      // right-pointing arrow burst
      return (
        <svg viewBox="0 0 20 20" {...s} aria-hidden>
          <path d="M3 10 h10 M9 5 l5 5 l-5 5" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'checker':
      // magnifier
      return (
        <svg viewBox="0 0 20 20" {...s} aria-hidden>
          <circle cx="9" cy="9" r="4.2" fill="none" stroke={stroke} strokeWidth="1.8" />
          <path d="M12.5 12.5 l4 4" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'helper':
    default:
      // heart
      return (
        <svg viewBox="0 0 20 20" {...s} aria-hidden>
          <path
            d="M10 15.5 s-5.6-3.5-5.6-7.3 A2.7 2.7 0 0 1 10 6.6 A2.7 2.7 0 0 1 15.6 8.2 C15.6 12 10 15.5 10 15.5 Z"
            fill="#ff8fa3"
            stroke={stroke}
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
}

function roleWord(role: Role): string {
  switch (role) {
    case 'planner': return 'planner';
    case 'runner': return 'doer';
    case 'checker': return 'checker';
    case 'helper': return 'rescuer';
  }
}
