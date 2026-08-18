import type { Message } from '../runtime/types';

interface Props {
  message: Message;
  who: string;
}

const KIND_TO_CLASS: Record<Message['kind'], string> = {
  greet: '',
  assign: '',
  ack: '',
  progress: '',
  stall: 'stall',
  handoff: 'handoff',
  done: 'done',
  arrive: 'done',
};

export function SpeechBubble({ message, who }: Props) {
  const cls = KIND_TO_CLASS[message.kind] ?? '';
  return (
    <div className={`bubble ${cls}`} aria-hidden>
      <span className="who">{who}</span>
      {trim(message.text, 70)}
    </div>
  );
}

function trim(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + '…';
}
