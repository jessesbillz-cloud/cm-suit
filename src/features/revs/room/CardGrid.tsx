// One rev on a room card's Setup (0119): its items across the top, "All walls" then each wall of the room down the
// side, a box where they meet (CardBox). The wall names stay put while a long rev scrolls sideways inside its card on a
// phone (the page itself never does). A tap on a box turns it over, on All walls makes the item needed on every wall
// (or none, when it already is). Signed off, Asked for and Failed tap to a short toast instead.
import type { StatusIndex } from '../model';
import { CardBox } from './CardBox';
import { allWalls, boxKey, boxNow, boxShown, isKept, type BoxNow, type CardChanges, type CardRev, type CardWall } from './cardSetup';

interface CardGridProps {
  rev: CardRev;
  walls: readonly CardWall[];
  index: StatusIndex;
  changes: CardChanges;
  readOnly: boolean;
  onFlip: (key: string, now: BoxNow) => void;
  onKept: (now: BoxNow) => void;
  onAll: (itemId: string) => void;
}

const SIDE = 'sticky left-0 z-[1] bg-card pr-2 text-left align-middle text-[14px] font-semibold leading-5 text-ink break-words';

export function CardGrid({ rev, walls, index, changes, readOnly, onFlip, onKept, onAll }: CardGridProps) {
  return (
    <section className="flex flex-col gap-1.5" data-testid={`rev-card-rev-${String(rev.rev.number)}`}>
      <h2 className="break-words text-[16px] font-semibold leading-6 text-ink">{rev.rev.name}</h2>
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <table className="w-full border-separate border-spacing-x-1.5 border-spacing-y-1.5">
          <thead>
            <tr>
              <td className={`${SIDE} w-[7.5rem] min-w-[6.5rem]`} />
              {rev.items.map((it) => (
                <th
                  key={it.item.id}
                  scope="col"
                  className="min-w-[6.5rem] px-0.5 pb-0.5 text-left align-bottom text-[13px] font-semibold leading-4 text-ink-2 break-words"
                >
                  {it.short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr data-testid="rev-card-all">
              <th scope="row" className={`${SIDE} border-b border-line pb-1.5 font-medium text-ink-2`}>
                All walls
              </th>
              {rev.items.map((it) => {
                const all = allWalls(index, walls, it.item.id, changes);
                return (
                  <td key={it.item.id} className="border-b border-line pb-1.5">
                    {all === 'locked' ? null : (
                      <CardBox
                        state={all}
                        changed={false}
                        readOnly={readOnly}
                        name={`All walls, ${it.short}`}
                        testId={`rev-card-all-${it.item.id}`}
                        onTap={() => {
                          onAll(it.item.id);
                        }}
                      />
                    )}
                  </td>
                );
              })}
            </tr>
            {walls.map((w) => (
              <tr key={w.area.id} data-testid={`rev-card-wall-${w.area.id}`}>
                <th scope="row" className={SIDE}>
                  {w.title}
                </th>
                {rev.items.map((it) => {
                  const now = boxNow(index, w.area.id, it.item.id);
                  const key = boxKey(w.area.id, it.item.id);
                  return (
                    <td key={it.item.id}>
                      <CardBox
                        state={boxShown(now, changes, key)}
                        changed={changes.has(key)}
                        readOnly={readOnly}
                        name={`${w.title}, ${it.short}`}
                        testId={`rev-card-box-${w.area.id}-${it.item.id}`}
                        onTap={() => {
                          if (isKept(now.state)) onKept(now);
                          else onFlip(key, now);
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
