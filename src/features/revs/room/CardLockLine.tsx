// "Locked by Ada Admin · Oct 23" (0119): a room's card once it is saved, on the room's page for everyone and in the
// card's Setup bar. The day in the job's time zone (lib/dates). Nothing when the card is open to edit.
import { Lock } from 'lucide-react';
import type { CardLockers } from '../../../data/revs.card';
import type { RevRoom } from '../../../data/revs.rooms';
import { formatInZone } from '../../../lib/dates';
import { Icon } from '../../../ui/Icon';

interface CardLockLineProps {
  room: RevRoom;
  lockers: CardLockers | undefined;
  timeZone: string;
  className?: string | undefined;
}

/** The words, or null when the card is open. */
function lockWords(room: RevRoom, lockers: CardLockers | undefined, timeZone: string): string | null {
  if (room.card_locked_at === null) return null;
  const who = room.card_locked_by === null ? undefined : lockers?.get(room.card_locked_by);
  const day = formatInZone(room.card_locked_at, timeZone, 'MMM d');
  return who ? `Locked by ${who} · ${day}` : `Locked · ${day}`;
}

export function CardLockLine({ room, lockers, timeZone, className = '' }: CardLockLineProps) {
  const words = lockWords(room, lockers, timeZone);
  if (words === null) return null;
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-ink-2 ${className}`} data-testid="rev-card-locked">
      <Icon icon={Lock} size={14} className="shrink-0" />
      <span className="min-w-0 break-words">{words}</span>
    </span>
  );
}
