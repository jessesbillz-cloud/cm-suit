// A room's inspection card set up, on one screen (0101; Jesse, Oct 12: "somebody making the revs for that room sees:
// OK, we got these two interior walls right here ... for these two, what do we need? ... everything else should just
// go away"). A manager's: first the room's walls as big boxes, on (a tap takes one off: tracked with its other room),
// then every item under its rev; tap the ones the walls need. An item with a sign-off, a request or a failure is locked
// on in its state. Save sets every other item on the kept walls as not applicable; the toast offers Undo. Cancel goes
// back to the room as it was.
import { useMemo, useState } from 'react';
import { messageOf } from '../../../data/errors';
import { useSaveCard, useUndoCard } from '../../../data/revs.card';
import type { RevRoom, RevRooms } from '../../../data/revs.rooms';
import type { RevSetup } from '../../../data/revs.types';
import { Button } from '../../../ui/Button';
import { EmptyState } from '../../../ui/States';
import { useToast } from '../../../ui/Toast';
import type { StatusIndex } from '../model';
import { roomLabel } from '../rooms';
import { StateBox } from '../StateBox';
import { cardRevs, cardSave, cardWalls, firstPicks, type CardItem } from './cardSetup';

interface CardSetupProps {
  room: RevRoom;
  setup: RevSetup;
  index: StatusIndex;
  rooms: RevRooms;
  isPhone: boolean;
  /** Back to the room (saved, or Cancel). */
  onDone: () => void;
}

const HEAD = 'text-[13px] font-bold uppercase leading-5 tracking-[0.06em] text-ink';
const BOXES = 'flex flex-wrap gap-2';

function ItemBox({ it, on, onTap }: { it: CardItem; on: boolean; onTap: () => void }) {
  return (
    <StateBox
      state={it.locked ?? 'open'}
      label={it.short}
      name={it.item.name}
      picked={it.locked === null && on}
      pressed={it.locked !== null || on}
      disabled={it.locked !== null}
      testId={`rev-card-item-${it.item.id}`}
      onClick={onTap}
    />
  );
}

export function CardSetup({ room, setup, index, rooms, isPhone, onDone }: CardSetupProps) {
  const save = useSaveCard();
  const undo = useUndoCard();
  const toast = useToast();
  const walls = useMemo(() => cardWalls(setup, rooms, room), [setup, rooms, room]);
  const [wallsOn, setWallsOn] = useState<ReadonlySet<string>>(() => new Set(walls.filter((w) => w.inRoom).map((w) => w.area.id)));
  const kept = walls.filter((w) => wallsOn.has(w.area.id)).map((w) => w.area.id);
  const revs = cardRevs(setup, index, room.list_id, kept);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(firstPicks(room, revs, index, kept)));
  const flip = (set: ReadonlySet<string>, id: string) => {
    const next = new Set(set);
    if (!next.delete(id)) next.add(id);
    return next;
  };
  const failed = (e: unknown) => {
    toast.show({ tone: 'error', message: messageOf(e) });
  };
  const onSave = () => {
    save.mutate(
      { room, ...cardSave(walls, wallsOn, revs, picked) },
      {
        onSuccess: (saved) => {
          toast.show({
            message: 'Card saved.',
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

  return (
    <div className="flex flex-col gap-5" data-testid="rev-card-setup">
      <h1 className="heading break-words text-[26px] font-semibold leading-8 text-ink">{roomLabel(room)}</h1>
      <section className="flex flex-col gap-2">
        <h2 className={HEAD}>Walls</h2>
        {walls.length === 0 ? <EmptyState title="No walls in this room yet." /> : null}
        <div role="group" aria-label="Walls" className={BOXES}>
          {walls.map((w) => (
            <StateBox
              key={w.area.id}
              state="open"
              label={w.title}
              name={w.area.name}
              picked={wallsOn.has(w.area.id)}
              off={!wallsOn.has(w.area.id)}
              pressed={wallsOn.has(w.area.id)}
              testId={`rev-card-wall-${w.area.id}`}
              onClick={() => {
                setWallsOn((s) => flip(s, w.area.id));
              }}
            />
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-4 border-t border-line pt-4">
        <h2 className={HEAD}>Items</h2>
        {revs.length === 0 ? <EmptyState title="This list has no revs yet." /> : null}
        {revs.map(({ rev, items }) => (
          <div key={rev.id} className="flex flex-col gap-2" data-testid={`rev-card-rev-${String(rev.number)}`}>
            <h3 className="break-words text-[15px] font-semibold leading-5 text-ink-2">{rev.name}</h3>
            <div role="group" aria-label={rev.name} className={BOXES}>
              {items.map((it) => (
                <ItemBox
                  key={it.item.id}
                  it={it}
                  on={picked.has(it.item.id)}
                  onTap={() => {
                    setPicked((s) => flip(s, it.item.id));
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </section>
      <div className={`flex gap-2 ${isPhone ? 'sticky bottom-0 z-10 -mx-4 border-t border-line bg-card px-4 py-3' : ''}`}>
        <Button variant="primary" size="lg" className={isPhone ? 'flex-1' : ''} loading={save.isPending} data-testid="rev-card-save" onClick={onSave}>
          Save
        </Button>
        <Button size="lg" variant="quiet" disabled={save.isPending} data-testid="rev-card-cancel" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
