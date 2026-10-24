// A room's inspection card set up (0101, 0119; Jesse, Oct 23: "go into that room, click what inspections we need to
// achieve, and save it. Then there should be some kind of lock on it so not everyone can edit it"). A manager's, on its
// own screen: each rev a grid of the room's walls by its items (CardGrid), each box in a word. A tap turns Needed and
// Not needed over (marked changed until saved), All walls does the item on every wall, and a sign-off or a request says
// so in a toast and stays. Save sends the changes, locks the card and goes back to the room (the toast offers Undo).
// A locked card reads only, with Unlock to edit. Cancel drops the changes, and locks the card again when this screen
// unlocked it. The room's walls themselves are added or taken out on the room's page.
import { useMemo, useState } from 'react';
import { messageOf } from '../../../data/errors';
import { useCardLockers, useLockCard, useSetCard, useUndoCard } from '../../../data/revs.card';
import type { RevRoom, RevRooms } from '../../../data/revs.rooms';
import type { RevSetup } from '../../../data/revs.types';
import { formatInZone } from '../../../lib/dates';
import { CARD_STATE } from '../../../lib/status';
import { EmptyState } from '../../../ui/States';
import { useToast } from '../../../ui/Toast';
import type { StatusIndex } from '../model';
import { roomLabel } from '../rooms';
import { CardBar } from './CardBar';
import { CardGrid } from './CardGrid';
import { cardRevs, cardWalls, changeList, flipBox, setAllWalls, type BoxNow, type CardChanges } from './cardSetup';

interface CardSetupProps {
  room: RevRoom;
  setup: RevSetup;
  index: StatusIndex;
  rooms: RevRooms;
  timeZone: string;
  isPhone: boolean;
  /** Back to the room (saved, Cancel or Close). */
  onDone: () => void;
}

export function CardSetup({ room, setup, index, rooms, timeZone, isPhone, onDone }: CardSetupProps) {
  const save = useSetCard();
  const undo = useUndoCard();
  const lock = useLockCard();
  const lockers = useCardLockers(room.project_id);
  const toast = useToast();
  const walls = useMemo(() => cardWalls(setup, rooms, room), [setup, rooms, room]);
  const revs = useMemo(() => cardRevs(setup, room.list_id), [setup, room.list_id]);
  const [changes, setChanges] = useState<CardChanges>(() => new Map());
  const [unlockedHere, setUnlockedHere] = useState(false);
  const locked = room.card_locked_at !== null;
  const busy = save.isPending || lock.isPending;
  const failed = (e: unknown) => {
    toast.show({ tone: 'error', message: messageOf(e) });
  };
  const onKept = (now: BoxNow) => {
    const day = now.at === null ? '' : ` ${formatInZone(now.at, timeZone, 'MMM d')}`;
    toast.show({ message: `${CARD_STATE[now.state].label}${day} — can't be removed` });
  };
  const onSave = () => {
    save.mutate(
      { room, cells: changeList(changes) },
      {
        onSuccess: (saved) => {
          toast.show({
            message: 'Card saved and locked.',
            action: {
              label: 'Undo',
              onClick: () => {
                void undo.mutateAsync({ projectId: room.project_id, roomId: room.id, version: saved.version, undo: saved.undo }).catch(failed);
              },
            },
          });
          onDone();
        },
        onError: failed,
      },
    );
  };
  const onUnlock = () => {
    lock.mutate({ room, locked: false }, { onSuccess: () => { setUnlockedHere(true); }, onError: failed });
  };
  const onCancel = () => {
    if (!locked && unlockedHere) lock.mutate({ room, locked: true }, { onSuccess: onDone, onError: failed });
    else onDone();
  };

  return (
    <div className="flex flex-col gap-5" data-testid="rev-card-setup" data-locked={locked ? 'true' : 'false'}>
      <h1 className="heading break-words text-[26px] font-semibold leading-8 text-ink">{roomLabel(room)}</h1>
      {walls.length === 0 ? <EmptyState title="No walls in this room yet." /> : null}
      {walls.length > 0 && revs.length === 0 ? <EmptyState title="This list has no revs yet." /> : null}
      {walls.length > 0
        ? revs.map((rev) => (
            <CardGrid
              key={rev.rev.id}
              rev={rev}
              walls={walls}
              index={index}
              changes={changes}
              readOnly={locked || busy}
              onFlip={(key, now) => {
                setChanges((c) => flipBox(c, now, key));
              }}
              onKept={onKept}
              onAll={(itemId) => {
                setChanges((c) => setAllWalls(index, walls, itemId, c));
              }}
            />
          ))
        : null}
      <CardBar
        room={room}
        lockers={lockers.data}
        timeZone={timeZone}
        changes={changes.size}
        busy={busy}
        saving={save.isPending}
        isPhone={isPhone}
        onSave={onSave}
        onCancel={onCancel}
        onUnlock={onUnlock}
      />
    </div>
  );
}
