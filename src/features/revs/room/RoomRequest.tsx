// Add for the whole room (0113; Jesse, Oct 23: "there should be a way to do top of wall for the entire room, so we
// don't have to break it down per individual wall"): per rev, each item the room's walls need (its card's), as a big
// box with Add: it goes in the request being built on every wall of the room that still needs it (asked for, passed
// and not applicable ones are skipped), with Undo. "4 walls" says how many it would add; In request when they all are.
import { Check, Plus } from 'lucide-react';
import { SECTION_HEAD } from '../../../ui/PageHeader';
import { Icon } from '../../../ui/Icon';
import type { RoomRev } from '../basket/basketModel';

interface RoomRequestProps {
  revs: readonly RoomRev[];
  busy: boolean;
  onAdd: (itemId: string, itemName: string) => void;
}

const BOX =
  'heading flex min-h-14 w-full flex-col items-start justify-center gap-0.5 rounded-lg border-2 px-3 py-2 text-left shadow-tile transition-[box-shadow,transform] duration-150 hover:-translate-y-px hover:shadow-tile-hover active:translate-y-0 active:shadow-press disabled:cursor-default disabled:hover:translate-y-0 disabled:hover:shadow-tile';

const walls = (n: number) => (n === 1 ? '1 wall' : `${String(n)} walls`);

export function RoomRequest({ revs, busy, onAdd }: RoomRequestProps) {
  if (revs.length === 0) return null;
  return (
    <section className="flex flex-col gap-3" data-testid="rev-room-whole">
      <h2 className={SECTION_HEAD}>Whole room</h2>
      {revs.map(({ rev, items }) => (
        <div key={rev.id} className="flex flex-col gap-1.5">
          <h3 className="heading text-[12.5px] font-semibold uppercase tracking-[0.06em] text-ink-2">{rev.name}</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
            {items.map(({ item, toAdd, inIt }) => {
              const done = toAdd === 0;
              const all = done && inIt > 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`${BOX} ${all ? 'border-ink bg-ink text-white' : done ? 'border-line-strong bg-card text-ink-3' : 'border-ink bg-card text-ink'}`}
                  disabled={busy || done}
                  data-testid={`rev-room-add-${item.id}`}
                  data-count={toAdd}
                  data-in={all ? 'true' : undefined}
                  onClick={() => {
                    onAdd(item.id, item.name);
                  }}
                >
                  <span className="break-words text-[14px] font-semibold normal-case leading-5 tracking-normal">{item.name}</span>
                  <span className="flex items-center gap-1 text-[12px] font-semibold uppercase tracking-[0.06em]">
                    <Icon icon={all ? Check : Plus} size={14} />
                    {all ? 'In request' : done ? 'Nothing to add' : `Add · ${walls(toAdd)}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
