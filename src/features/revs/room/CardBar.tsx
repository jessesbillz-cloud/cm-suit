// The bar under a room card's Setup (0119): open, "3 changes" then Save and Cancel; locked, who locked it and when,
// Unlock to edit (a manager's) and Close. On a phone it sticks to the bottom of the screen.
import { LockOpen } from 'lucide-react';
import type { CardLockers } from '../../../data/revs.card';
import type { RevRoom } from '../../../data/revs.rooms';
import { Button } from '../../../ui/Button';
import { CardLockLine } from './CardLockLine';
import { changesLine } from './cardSetup';

interface CardBarProps {
  room: RevRoom;
  lockers: CardLockers | undefined;
  timeZone: string;
  changes: number;
  busy: boolean;
  saving: boolean;
  isPhone: boolean;
  onSave: () => void;
  onCancel: () => void;
  onUnlock: () => void;
}

export function CardBar({ room, lockers, timeZone, changes, busy, saving, isPhone, onSave, onCancel, onUnlock }: CardBarProps) {
  const locked = room.card_locked_at !== null;
  const size = isPhone ? 'lg' : 'md';
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3 ${isPhone ? 'sticky bottom-0 z-10 -mx-4 bg-card px-4 pb-3' : ''}`}
      data-testid="rev-card-bar"
    >
      {locked ? (
        <>
          <CardLockLine room={room} lockers={lockers} timeZone={timeZone} className="mr-auto" />
          <Button size={size} variant="primary" icon={LockOpen} loading={busy} data-testid="rev-card-unlock" onClick={onUnlock}>
            Unlock to edit
          </Button>
          <Button size={size} variant="quiet" disabled={busy} data-testid="rev-card-cancel" onClick={onCancel}>
            Close
          </Button>
        </>
      ) : (
        <>
          <span className="mr-auto text-[14px] font-semibold tabular-nums text-ink" data-testid="rev-card-changes" data-count={changes} aria-live="polite">
            {changesLine(changes)}
          </span>
          <Button size={size} variant="primary" loading={saving} disabled={busy && !saving} data-testid="rev-card-save" onClick={onSave}>
            Save
          </Button>
          <Button size={size} variant="quiet" disabled={busy} data-testid="rev-card-cancel" onClick={onCancel}>
            Cancel
          </Button>
        </>
      )}
    </div>
  );
}
