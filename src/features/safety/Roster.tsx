// Who is on the sheet: each person's name, company and trade, when they signed (the job's clock) or "Ticked in", and on
// a closed meeting their signature. While open it refreshes by itself as the crew signs from the QR; the leader can take
// a line off (a wrong name), with Undo.
import { X } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useRemoveLine } from '../../data/safety.mutations';
import type { Signin } from '../../data/safety.types';
import { formatInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';
import { SignatureView } from './SignatureView';

interface RosterProps {
  projectId: string;
  lines: readonly Signin[];
  timeZone: string;
  /** The leader, while open: lines can come off. */
  canRemove: boolean;
}

function Line({ line, timeZone, onRemove }: { line: Signin; timeZone: string; onRemove: (() => void) | undefined }) {
  const facts = [line.company, line.trade].filter((x) => x.trim() !== '').join(' · ');
  return (
    <li className="flex min-h-[52px] items-center gap-3 py-2" data-testid="safety-line">
      <span className="min-w-0 flex-1">
        <span className="block break-words text-[15px] font-medium leading-6 text-ink">{line.name}</span>
        {facts !== '' ? <span className="block break-words text-[13px] leading-5 text-ink-2">{facts}</span> : null}
      </span>
      {line.signature ? <SignatureView strokes={line.signature} label={`${line.name}'s signature`} /> : null}
      <span className="shrink-0 text-right text-[13px] tabular-nums text-ink-2">
        {line.signed_at ? formatInZone(line.signed_at, timeZone, 'h:mm a') : 'Ticked in'}
      </span>
      {onRemove ? <Button size="sm" variant="quiet" icon={X} aria-label={`Take ${line.name} off`} onClick={onRemove} /> : null}
    </li>
  );
}

export function Roster({ projectId, lines, timeZone, canRemove }: RosterProps) {
  const remove = useRemoveLine(projectId);
  const toast = useToast();

  function takeOff(line: Signin) {
    remove.mutate(
      { signinId: line.id, removed: true },
      {
        onSuccess: () => {
          toast.show({
            message: `${line.name} taken off.`,
            action: {
              label: 'Undo',
              onClick: () => {
                remove.mutate(
                  { signinId: line.id, removed: false },
                  { onError: (e) => { toast.show({ tone: 'error', message: `Not undone: ${messageOf(e)}` }); } },
                );
              },
            },
          });
        },
        onError: (e) => {
          toast.show({ tone: 'error', message: messageOf(e) });
        },
      },
    );
  }

  return (
    <section className="flex flex-col" data-testid="safety-roster">
      <h2 className="flex items-baseline justify-between gap-3 border-b border-line pb-2 text-sm font-semibold text-ink">
        Signed in
        <span className="text-[13px] font-medium tabular-nums text-ink-2" data-testid="safety-count">
          {lines.length}
        </span>
      </h2>
      {lines.length === 0 ? (
        <p className="py-4 text-sm text-ink-2">Nobody yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {lines.map((l) => (
            <Line key={l.id} line={l} timeZone={timeZone} onRemove={canRemove ? () => { takeOff(l); } : undefined} />
          ))}
        </ul>
      )}
    </section>
  );
}
