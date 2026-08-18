import { useEffect, useRef } from 'react';
import type { Agent, Message } from '../runtime/types';

interface Props {
  messages: Message[];
  agents: Agent[];
}

export function ActivityLog({ messages, agents }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const byId = new Map(agents.map((a) => [a.id, a]));

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [messages.length]);

  return (
    <div className="log" ref={ref} role="log" aria-live="polite" aria-relevant="additions">
      <ul>
        {messages.map((m) => {
          const who = byId.get(m.fromAgentId)?.name ?? m.fromAgentId;
          return (
            <li key={m.id} className={m.kind}>
              <span className="tick">t={m.tick}</span>
              <span className="who">{who}:</span>
              <span>{m.text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
