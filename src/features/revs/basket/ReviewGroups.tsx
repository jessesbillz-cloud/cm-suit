// The review's requests (0113): one box per OFS request Send will file, its item, its OFS number (typed by whoever
// sends OFS requests, 0091, prefilled with the database's next ones in turn), and its walls, each with its room and
// its facts read from the wall ("F6a · 1 HR · UL U419 · A201", "UL —" when not known). A tap on a wall's X takes that
// wall's item out of the request.
import { X } from 'lucide-react';
import { FIELD_CONTROL } from '../../../ui/Fields';
import { Icon } from '../../../ui/Icon';
import { SECTION_HEAD } from '../../../ui/PageHeader';
import type { ReviewGroup } from './basketModel';

interface ReviewGroupsProps {
  groups: readonly ReviewGroup[];
  /** Typed OFS numbers by group key; null: shown, not typed. */
  numbers: Readonly<Record<string, string>> | null;
  onNumber: (key: string, value: string) => void;
  onRemove: (areaId: string, itemId: string) => void;
  busy: boolean;
}

const pad = (n: number) => String(n).padStart(4, '0');

function NumberBox({ group, value, onNumber }: { group: ReviewGroup; value: string; onNumber: (key: string, value: string) => void }) {
  return (
    <label className="flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-ink">
      OFS #
      <input
        className={`${FIELD_CONTROL} w-24`}
        inputMode="numeric"
        value={value}
        aria-label={`OFS number for ${group.item.name}`}
        data-testid="basket-ofs-number"
        onChange={(e) => {
          onNumber(group.key, e.target.value.replace(/[^0-9]/g, ''));
        }}
      />
    </label>
  );
}

export function ReviewGroups({ groups, numbers, onNumber, onRemove, busy }: ReviewGroupsProps) {
  return (
    <div className="flex flex-col gap-3" data-testid="basket-groups">
      {groups.map((g) => (
        <section
          key={g.key}
          className="overflow-hidden rounded-lg border-[1.5px] border-ink bg-card shadow-tile"
          data-testid="basket-group"
          data-item={g.item.id}
        >
          <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line bg-card-head px-3 py-2">
            <h3 className={`${SECTION_HEAD} min-w-0 flex-1 border-b-0 px-0 pb-0 text-[15px]`}>
              {g.rev ? <span className="text-ink-2">{`${g.rev.name} · `}</span> : null}
              {g.item.name}
            </h3>
            {numbers === null ? (
              <span className="text-[13px] font-semibold tabular-nums text-ink-2" data-testid="basket-ofs">{`OFS #${pad(g.ofsNumber)}`}</span>
            ) : (
              <NumberBox group={g} value={numbers[g.key] ?? String(g.ofsNumber)} onNumber={onNumber} />
            )}
          </header>
          <ul className="divide-y divide-line">
            {g.walls.map((w) => (
              <li key={w.area.id} className="flex items-center gap-2 px-3 py-2" data-testid={`basket-wall-${w.area.id}`}>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="break-words text-[14px] font-medium text-ink">{w.label}</span>
                  <span className="break-words text-[12.5px] text-ink-2" data-testid="basket-facts">
                    {w.facts}
                  </span>
                </span>
                <button
                  type="button"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-page hover:text-ink disabled:opacity-40"
                  aria-label={`Take ${w.label} out`}
                  disabled={busy}
                  data-testid="basket-remove"
                  onClick={() => {
                    onRemove(w.area.id, g.item.id);
                  }}
                >
                  <Icon icon={X} size={18} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
