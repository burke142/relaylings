interface Props {
  goal: string;
  ticks: number;
  taskCount?: number;
  onReplay: () => void;
  reducedMotion: boolean;
}

// Confetti colors are seeded from a fixed palette so the celebration
// is deterministic and consistent with the app theme.
const CONFETTI_COLORS = [
  '#ffd66e',
  '#ffb84d',
  '#ff9ec4',
  '#7ce0d3',
  '#b7a7ff',
  '#a1f0b7',
];

// A fixed set of confetti positions so the render is stable and no
// runtime randomness is introduced.
const CONFETTI_PIECES = Array.from({ length: 40 }, (_, i) => {
  const left = ((i * 173) % 100) + '%';
  const delay = ((i * 71) % 260) / 100;
  const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
  return { left, delay, color };
});

export function Celebration({ goal, ticks, taskCount, onReplay, reducedMotion }: Props) {
  return (
    <div className="celebrate" role="region" aria-live="polite" aria-label="Mission complete">
      {!reducedMotion && (
        <div className="confetti" aria-hidden>
          {CONFETTI_PIECES.map((p, i) => (
            <span
              key={i}
              style={{ left: p.left, background: p.color, animationDelay: `${p.delay}s` }}
            />
          ))}
        </div>
      )}
      <h3>You made it! Goal reached.</h3>
      <p><strong>“{goal}”</strong></p>
      <p>{taskCount === undefined
        ? <>Your helpers finished in {ticks} step{ticks === 1 ? '' : 's'}.</>
        : <>Your helpers finished {taskCount} task{taskCount === 1 ? '' : 's'} together.</>}</p>
      <div className="row">
        <button className="primary big" onClick={onReplay}>Try another goal →</button>
      </div>
    </div>
  );
}
